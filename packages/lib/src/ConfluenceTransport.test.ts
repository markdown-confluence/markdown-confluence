import { afterEach, expect, test, vi } from "@effect/vitest";
import {
	AxiosError,
	AxiosHeaders,
	type AxiosAdapter,
	type InternalAxiosRequestConfig,
} from "axios";
import { createConfluenceTransport } from "./ConfluenceTransport";

afterEach(() => vi.useRealTimers());

const config = (method = "get"): InternalAxiosRequestConfig => ({
	method,
	baseURL: "https://example.atlassian.net/wiki/rest",
	url: "/api/content?token=do-not-log",
	headers: new AxiosHeaders({ Authorization: "Bearer secret" }),
});

test("retries transient reads and preserves a useful error when retries are exhausted", async () => {
	vi.useFakeTimers();
	const request = config();
	const adapter = vi.fn(async () => {
		throw new AxiosError("socket disconnected", "ECONNRESET", request);
	});
	const result = createConfluenceTransport(adapter)(request).catch((error) => error);
	await vi.runAllTimersAsync();
	const error = await result;
	expect(adapter).toHaveBeenCalledTimes(3);
	expect(error.message).toBe("Confluence GET /api/content failed: ECONNRESET");
	expect(error.isAxiosError).toBeUndefined();
	expect(JSON.stringify(error)).not.toContain("secret");
	expect(error.message).not.toContain("do-not-log");
});

test("does not replay a write after an ambiguous connection failure", async () => {
	const request = { ...config("post"), data: '{"title":"Page"}' };
	const adapter = vi.fn(async () => {
		throw new AxiosError("socket disconnected", "ECONNRESET", request);
	});
	await expect(createConfluenceTransport(adapter)(request)).rejects.toThrow("ECONNRESET");
	expect(adapter).toHaveBeenCalledOnce();
});

test("honors Retry-After for a rejected JSON write", async () => {
	vi.useFakeTimers();
	const request = { ...config("post"), data: '{"title":"Page"}' };
	const response = {
		status: 429,
		statusText: "Too Many Requests",
		headers: new AxiosHeaders({ "retry-after": "2" }),
		config: request,
		data: {},
	};
	const adapter = vi
		.fn<AxiosAdapter>()
		.mockRejectedValueOnce(
			new AxiosError("rate limited", "ERR_BAD_REQUEST", request, undefined, response),
		)
		.mockResolvedValue({ ...response, status: 200, data: { id: "created-once" } });
	const result = createConfluenceTransport(adapter)(request);
	await vi.advanceTimersByTimeAsync(1999);
	expect(adapter).toHaveBeenCalledOnce();
	await vi.advanceTimersByTimeAsync(1);
	expect((await result).data).toEqual({ id: "created-once" });
	expect(adapter).toHaveBeenCalledTimes(2);
});

test("aborts a Retry-After wait immediately without sending another request", async () => {
	vi.useFakeTimers();
	const controller = new AbortController();
	const request = { ...config(), signal: controller.signal };
	const response = {
		status: 429,
		statusText: "Too Many Requests",
		headers: new AxiosHeaders({ "retry-after": "30" }),
		config: request,
		data: {},
	};
	const adapter = vi
		.fn<AxiosAdapter>()
		.mockRejectedValue(
			new AxiosError("rate limited", "ERR_BAD_REQUEST", request, undefined, response),
		);
	const result = createConfluenceTransport(adapter)(request).catch((error) => error);
	await vi.advanceTimersByTimeAsync(0);
	expect(vi.getTimerCount()).toBe(1);
	controller.abort();
	expect((await result).message).toBe("Confluence request aborted");
	expect(adapter).toHaveBeenCalledOnce();
	expect(vi.getTimerCount()).toBe(0);
});

test("does not send an already aborted request", async () => {
	const adapter = vi.fn<AxiosAdapter>();
	await expect(
		createConfluenceTransport(adapter)({ ...config(), signal: AbortSignal.abort() }),
	).rejects.toThrow("Confluence request aborted");
	expect(adapter).not.toHaveBeenCalled();
});

test.each(["stream", "long-delay", "forbidden"])(
	"does not retry %s responses unsafely",
	async (scenario) => {
		const request = {
			...config("put"),
			data: scenario === "stream" ? { pipe: () => undefined } : "body",
		};
		const response = {
			status: scenario === "forbidden" ? 403 : 429,
			statusText: "Rejected",
			headers: new AxiosHeaders({ "retry-after": scenario === "long-delay" ? "60" : "0" }),
			config: request,
			data: { message: "Rejected" },
		};
		const adapter = vi.fn(async () => {
			throw new AxiosError("rejected", "ERR_BAD_REQUEST", request, undefined, response);
		});
		await expect(createConfluenceTransport(adapter)(request)).rejects.toMatchObject({
			response: { status: response.status },
		});
		expect(adapter).toHaveBeenCalledOnce();
	},
);
