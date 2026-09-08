import { expect, test, vi } from "@effect/vitest";
import { Effect } from "effect";
import { createAuthenticatedConfluenceClient } from "./AuthenticatedConfluenceClient";
import { ConfluenceV2Client } from "./ConfluenceV2Client";
import type { ConfluenceFetch } from "./ConfluenceFetch";
import { cancellableClient } from "./PublishCancellation";
import { DEFAULT_SETTINGS } from "./Settings";

const baseUrl = "https://example.atlassian.net";
const page = {
	id: "123",
	spaceId: "456",
	title: "Page",
	status: "current",
	version: { number: 2 },
};
const update = { id: "123", title: "Page", version: { number: 2 } };
const json = (body: unknown) => new Response(JSON.stringify(body));
const authenticatedClient = (fetch: ConfluenceFetch) =>
	Effect.runPromise(
		createAuthenticatedConfluenceClient(
			{
				...DEFAULT_SETTINGS,
				confluenceBaseUrl: baseUrl,
				confluenceAuthType: "bearer",
				atlassianApiToken: "test-token",
			},
			{ fetch },
		),
	);

test.each(["authenticated", "standalone"])(
	"%s client stops between a space lookup and page creation",
	async (kind) => {
		const controller = new AbortController();
		const response = Promise.withResolvers<Response>();
		const started = Promise.withResolvers<void>();
		const fetch = vi.fn<ConfluenceFetch>(async () => {
			started.resolve();
			return response.promise;
		});
		const original =
			kind === "authenticated"
				? await authenticatedClient(fetch)
				: {
						content: new ConfluenceV2Client(baseUrl, "test-token", {}, fetch),
					};
		const client = cancellableClient(original, controller.signal);
		const pending = client.content.createContent({ title: "Page", space: { key: "DOC" } });
		await started.promise;
		controller.abort();
		response.resolve(json({ results: [{ id: "456", key: "DOC" }] }));
		await expect(pending).rejects.toThrow("Publishing cancelled");
		expect(fetch).toHaveBeenCalledOnce();
		expect(fetch.mock.calls[0]?.[0]).toContain("/spaces?keys=DOC");
	},
);

test("cancellation between an update's metadata lookup and PUT prevents the write", async () => {
	const controller = new AbortController();
	const lookup = Promise.withResolvers<Response>();
	const started = Promise.withResolvers<void>();
	const fetch = vi.fn<ConfluenceFetch>(async (url) => {
		if (url.endsWith("/spaces/456")) {
			started.resolve();
			return lookup.promise;
		}
		return json(page);
	});
	const client = cancellableClient(await authenticatedClient(fetch), controller.signal);
	const pending = client.content.updateContent(update);
	await started.promise;
	controller.abort();
	lookup.resolve(json({ id: "456", key: "DOC" }));
	await expect(pending).rejects.toThrow("Publishing cancelled");
	expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual(["GET", "GET"]);
});

test.each(["attachments", "labels"])(
	"cancellation stops %s pagination before the next request",
	async (kind) => {
		const controller = new AbortController();
		const response = Promise.withResolvers<Response>();
		const started = Promise.withResolvers<void>();
		const fetch = vi.fn<ConfluenceFetch>(async () => {
			started.resolve();
			return response.promise;
		});
		const client = cancellableClient(await authenticatedClient(fetch), controller.signal);
		const pending =
			kind === "attachments"
				? client.contentAttachments.getAttachments({ id: "123" })
				: client.contentLabels.getLabelsForContent({ id: "123" });
		await started.promise;
		controller.abort();
		response.resolve(
			json({ results: [], _links: { next: `/wiki/api/v2/pages/123/${kind}?cursor=next` } }),
		);
		await expect(pending).rejects.toThrow("Publishing cancelled");
		expect(fetch).toHaveBeenCalledOnce();
	},
);

test("a dispatched PUT finishes successfully and cancellation stays local to its publishing operation", async () => {
	const controller = new AbortController();
	const write = Promise.withResolvers<Response>();
	const started = Promise.withResolvers<void>();
	const fetch = vi.fn<ConfluenceFetch>(async (url, init) => {
		if (init.method === "PUT") {
			started.resolve();
			return write.promise;
		}
		return json(url.endsWith("/spaces/456") ? { id: "456", key: "DOC" } : page);
	});
	const original = await authenticatedClient(fetch);
	const client = cancellableClient(original, controller.signal);
	const pending = client.content.updateContent(update);
	await started.promise;
	const writeSignal = fetch.mock.calls.at(-1)?.[1].signal;
	controller.abort();
	expect(writeSignal?.aborted).toBe(false);
	write.resolve(json(page));
	await expect(pending).resolves.toMatchObject({
		id: "123",
		space: { key: "DOC" },
		version: { number: 2 },
	});
	expect(fetch).toHaveBeenCalledTimes(3);
	await expect(client.content.updateContent(update)).rejects.toThrow("Publishing cancelled");
	expect(fetch).toHaveBeenCalledTimes(3);
	await expect(original.content.getContentById({ id: "123" })).resolves.toMatchObject({
		id: "123",
	});
	const independent = cancellableClient(original, new AbortController().signal);
	await expect(independent.content.getContentById({ id: "123" })).resolves.toMatchObject({
		id: "123",
	});
});

test("cancelled authenticated clients guard v1 label writes, users and direct transport requests", async () => {
	const fetch = vi.fn<ConfluenceFetch>();
	const client = cancellableClient(await authenticatedClient(fetch), AbortSignal.abort());
	await expect(
		client.contentLabels.addLabelsToContent({
			id: "123",
			body: [{ name: "new", prefix: "global" }],
		}),
	).rejects.toThrow("Publishing cancelled");
	await expect(
		client.contentLabels.removeLabelFromContentUsingQueryParameter({ id: "123", name: "old" }),
	).rejects.toThrow("Publishing cancelled");
	await expect(client.users.getCurrentUser()).rejects.toThrow("Publishing cancelled");
	await expect(
		client.sendRequest({
			url: "/wiki/rest/api/content/123/child/attachment",
			method: "PUT",
			body: new FormData(),
		}),
	).rejects.toThrow("Publishing cancelled");
	expect(fetch).not.toHaveBeenCalled();
});

test("a dispatched create finishes successfully when publishing is cancelled", async () => {
	const controller = new AbortController();
	const write = Promise.withResolvers<Response>();
	const started = Promise.withResolvers<void>();
	const fetch = vi.fn<ConfluenceFetch>(async (_url, init) => {
		if (init.method === "POST") {
			started.resolve();
			return write.promise;
		}
		return json({ results: [{ id: "456", key: "DOC" }] });
	});
	const client = cancellableClient(await authenticatedClient(fetch), controller.signal);
	const pending = client.content.createContent({ title: "Page", space: { key: "DOC" } });
	await started.promise;
	controller.abort();
	expect(fetch.mock.calls.at(-1)?.[1].signal?.aborted).toBe(false);
	write.resolve(json(page));
	await expect(pending).resolves.toMatchObject({ id: "123", space: { key: "DOC" } });
	expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([false, true])(
	"an update never reports the source space for an unexpected moved response (cancelled: %s)",
	async (cancel) => {
		const controller = new AbortController();
		const fetch = vi.fn<ConfluenceFetch>(async (url, init) => {
			if (init.method === "PUT") {
				if (cancel) controller.abort();
				return json({ ...page, spaceId: "789" });
			}
			if (url.endsWith("/spaces/789")) return json({ id: "789", key: "MOVED" });
			return json(url.endsWith("/spaces/456") ? { id: "456", key: "DOC" } : page);
		});
		const client = cancellableClient(await authenticatedClient(fetch), controller.signal);
		const result = await client.content.updateContent({ ...update, space: { key: "WRONG" } });
		expect(result.id).toBe("123");
		expect(result.space).toEqual(cancel ? undefined : { key: "MOVED" });
		expect(fetch).toHaveBeenCalledTimes(cancel ? 3 : 4);
	},
);
