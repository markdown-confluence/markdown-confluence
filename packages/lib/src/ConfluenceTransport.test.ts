import { afterEach, expect, test, vi } from "@effect/vitest";
import type { SendRequestOptions } from "confluence.js/core";
import { createConfluenceTransport } from "./ConfluenceTransport";
import { cancellableClient } from "./PublishCancellation";

const config = {
	host: "https://example.atlassian.net",
	auth: { type: "bearer" as const, token: "secret" },
};
const options: SendRequestOptions = { url: "/wiki/api/v2/pages?token=do-not-log" };
const json = (body: unknown, status = 200, retryAfter?: string) =>
	new Response(JSON.stringify(body), {
		status,
		...(retryAfter ? { headers: { "retry-after": retryAfter } } : {}),
	});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

test("retries transient reads and keeps errors free of credentials and query parameters", async () => {
	vi.useFakeTimers();
	const fetch = vi.fn(async () => {
		throw Object.assign(new Error("secret connection detail"), {
			cause: { code: "ECONNRESET" },
		});
	});
	const result = createConfluenceTransport(config, fetch)
		.sendRequest(options)
		.catch((error) => error);
	await vi.runAllTimersAsync();
	const error = await result;
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(error.message).toBe("Confluence GET /wiki/api/v2/pages failed: ECONNRESET");
	expect(JSON.stringify(error)).not.toContain("secret");
	expect(error.message).not.toContain("do-not-log");
});
test("does not replay a write after an ambiguous connection failure", async () => {
	const fetch = vi.fn(async () => {
		throw Object.assign(new Error("socket disconnected"), { code: "ECONNRESET" });
	});
	await expect(
		createConfluenceTransport(config, fetch).sendRequest({
			...options,
			method: "POST",
			body: { title: "Page" },
		}),
	).rejects.toThrow("ECONNRESET");
	expect(fetch).toHaveBeenCalledOnce();
});
test("honors Retry-After for a rejected JSON write", async () => {
	vi.useFakeTimers();
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(json({}, 429, "2"))
		.mockResolvedValue(json({ id: "created-once" }));
	const result = createConfluenceTransport(config, fetch).sendRequest({
		...options,
		method: "POST",
		body: { title: "Page" },
	});
	await vi.advanceTimersByTimeAsync(1999);
	expect(fetch).toHaveBeenCalledOnce();
	await vi.advanceTimersByTimeAsync(1);
	expect(await result).toEqual({ id: "created-once" });
	expect(fetch).toHaveBeenCalledTimes(2);
});
test("aborts a Retry-After wait without sending another request", async () => {
	vi.useFakeTimers();
	const controller = new AbortController();
	vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
	const fetch = vi.fn().mockResolvedValue(json({}, 429, "30"));
	const result = createConfluenceTransport(config, fetch)
		.sendRequest(options)
		.catch((error) => error);
	await vi.advanceTimersByTimeAsync(0);
	controller.abort();
	expect((await result).message).toBe("Confluence request aborted");
	expect(fetch).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
});
test("does not send an already aborted request", async () => {
	vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
	const fetch = vi.fn();
	await expect(createConfluenceTransport(config, fetch).sendRequest(options)).rejects.toThrow(
		"Confluence request aborted",
	);
	expect(fetch).not.toHaveBeenCalled();
});
test.each(["network-read", "limited-read", "limited-write"])(
	"publishing cancellation interrupts a %s retry wait without cancelling the dispatched request",
	async (scenario) => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const fetch = vi.fn(async () => {
			if (scenario === "network-read")
				throw Object.assign(new Error("disconnected"), { code: "ECONNRESET" });
			return json({}, 429, "10");
		});
		const client = cancellableClient(
			createConfluenceTransport(config, fetch),
			controller.signal,
		);
		const result = client
			.sendRequest({ ...options, method: scenario === "limited-write" ? "PUT" : "GET" })
			.catch((error) => error);
		await vi.advanceTimersByTimeAsync(0);
		controller.abort();
		expect((await result).message).toBe(
			"Publishing cancelled. Completed writes have been kept.",
		);
		expect(fetch).toHaveBeenCalledOnce();
		expect((fetch.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(fetch).toHaveBeenCalledOnce();
	},
);
test.each(["multipart", "long-delay", "forbidden"])(
	"does not retry %s responses unsafely",
	async (scenario) => {
		const status = scenario === "forbidden" ? 403 : 429;
		const fetch = vi.fn(async () =>
			json({ message: "Rejected" }, status, scenario === "long-delay" ? "60" : "0"),
		);
		await expect(
			createConfluenceTransport(config, fetch).sendRequest({
				...options,
				method: "PUT",
				body: scenario === "multipart" ? new FormData() : { title: "Page" },
			}),
		).rejects.toMatchObject({ response: { status } });
		expect(fetch).toHaveBeenCalledOnce();
	},
);
test("never sends credentials outside the configured Cloud API", async () => {
	const fetch = vi.fn();
	const client = createConfluenceTransport(config, fetch);
	for (const url of [
		"https://other.test/wiki/api/v2/pages",
		"//other.test/wiki/api/v2/pages",
		"/wiki/../../other",
		"/wiki/\\other",
	]) {
		await expect(client.sendRequest({ url })).rejects.toThrow(/Cloud API|outside/);
	}
	expect(fetch).not.toHaveBeenCalled();
});
test("preserves authentication, multipart boundaries and redirect rejection", async () => {
	const fetch = vi.fn(async () => json({}));
	const body = new FormData();
	body.set("file", new Blob([new Uint8Array([0, 255, 128])]), "binary.bin");
	await createConfluenceTransport(
		{ ...config, headers: { Authorization: "stale", "Content-Type": "wrong" } },
		fetch,
	).sendRequest({ url: "/wiki/rest/api/content/123/child/attachment", method: "PUT", body });
	const init = fetch.mock.calls[0]![1] as RequestInit;
	expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret");
	expect(new Headers(init.headers).has("content-type")).toBe(false);
	expect(init.redirect).toBe("error");
	expect(init.body).toBe(body);
});
