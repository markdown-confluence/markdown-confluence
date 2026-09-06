import { afterEach, expect, test, vi } from "@effect/vitest";
import { ConfluenceV2Client, ConfluenceV2Error } from "./ConfluenceV2Client";

const BASE = "https://api.atlassian.com/ex/confluence/cloud-id";
const TOKEN = "test-token";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

/**
 * Builds a fetch mock that dispatches by URL substring, so tests can describe
 * the v2 endpoints they expect to be called.
 */
function routedFetch(routes: Array<{ match: string; response: () => Response }>) {
	return vi.fn(async (input: string | URL) => {
		const url = String(input);
		const route = routes.find((r) => url.includes(r.match));
		if (!route) {
			throw new Error(`Unexpected fetch to ${url}`);
		}
		return route.response();
	});
}

const PAGE = {
	id: "123",
	status: "current",
	title: "My Page",
	spaceId: "900",
	parentId: "100",
	version: { number: 3, authorId: "acc-1" },
	body: { atlas_doc_format: { value: '{"type":"doc"}', representation: "atlas_doc_format" } },
};

test("getContentById fetches the v2 page and adapts it to v1 shape", async () => {
	const fetchMock = routedFetch([
		{ match: "/wiki/api/v2/pages/123", response: () => jsonResponse(PAGE) },
		{
			match: "/wiki/api/v2/spaces/900",
			response: () => jsonResponse({ id: "900", key: "PCBF", name: "PCBF" }),
		},
	]);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const client = new ConfluenceV2Client(BASE, TOKEN);
	const content = await client.getContentById({ id: "123", expand: ["space"] });

	expect(content.id).toBe("123");
	expect(content.type).toBe("page");
	expect(content.title).toBe("My Page");
	expect(content.space?.key).toBe("PCBF");
	expect(content.version?.number).toBe(3);
	expect(content.version?.by?.accountId).toBe("acc-1");
	expect(content.body?.atlas_doc_format?.value).toBe('{"type":"doc"}');
	// No ancestors expansion requested -> ancestors endpoint not called.
	expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/ancestors"))).toBe(false);
});

test("getContentById fetches ancestors when expand includes ancestors", async () => {
	const fetchMock = routedFetch([
		{
			match: "/wiki/api/v2/pages/123/ancestors",
			response: () => jsonResponse({ results: [{ id: "100", type: "page" }] }),
		},
		{ match: "/wiki/api/v2/pages/123", response: () => jsonResponse(PAGE) },
		{
			match: "/wiki/api/v2/spaces/900",
			response: () => jsonResponse({ id: "900", key: "PCBF" }),
		},
	]);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const client = new ConfluenceV2Client(BASE, TOKEN);
	const content = await client.getContentById({
		id: "123",
		expand: ["ancestors", "space"],
	});

	expect(content.ancestors).toEqual([{ id: "100" }]);
});

test("getContent resolves the space key to an id and queries by title", async () => {
	const fetchMock = routedFetch([
		{
			match: "/wiki/api/v2/spaces?keys=PCBF",
			response: () => jsonResponse({ results: [{ id: "900", key: "PCBF" }] }),
		},
		{
			match: "/wiki/api/v2/spaces/900/pages",
			response: () => jsonResponse({ results: [PAGE] }),
		},
	]);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const client = new ConfluenceV2Client(BASE, TOKEN);
	const result = await client.getContent({
		type: "page",
		spaceKey: "PCBF",
		title: "My Page",
		expand: ["version"],
	});

	expect(result.size).toBe(1);
	expect(result.results[0]?.id).toBe("123");
	expect(result.results[0]?.space?.key).toBe("PCBF");
	const pagesCall = fetchMock.mock.calls.find(([u]) => String(u).includes("/spaces/900/pages"));
	expect(String(pagesCall?.[0])).toContain("title=My+Page");
	expect(String(pagesCall?.[0])).toContain("body-format=atlas_doc_format");
});

test("createContent posts a v2 page with spaceId, parentId, and adf body", async () => {
	const fetchMock = routedFetch([
		{
			match: "/wiki/api/v2/spaces?keys=PCBF",
			response: () => jsonResponse({ results: [{ id: "900", key: "PCBF" }] }),
		},
		{ match: "/wiki/api/v2/pages", response: () => jsonResponse(PAGE) },
	]);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const client = new ConfluenceV2Client(BASE, TOKEN);
	const content = await client.createContent({
		space: { key: "PCBF" },
		title: "My Page",
		type: "page",
		ancestors: [{ id: "100" }],
		body: { atlas_doc_format: { value: '{"type":"doc"}', representation: "atlas_doc_format" } },
	});

	expect(content.id).toBe("123");
	const postCall = fetchMock.mock.calls.find(
		([u, init]) =>
			String(u).endsWith("/wiki/api/v2/pages") && (init as RequestInit)?.method === "POST",
	);
	expect(postCall).toBeDefined();
	const body = JSON.parse(String((postCall![1] as RequestInit).body));
	expect(body).toMatchObject({
		spaceId: "900",
		status: "current",
		title: "My Page",
		parentId: "100",
		body: { representation: "atlas_doc_format", value: '{"type":"doc"}' },
	});
});

test("updateContent puts a v2 page with the new version number", async () => {
	const fetchMock = routedFetch([
		{
			match: "/wiki/api/v2/spaces/900",
			response: () => jsonResponse({ id: "900", key: "PCBF" }),
		},
		{ match: "/wiki/api/v2/pages/123", response: () => jsonResponse(PAGE) },
	]);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const client = new ConfluenceV2Client(BASE, TOKEN);
	await client.updateContent({
		id: "123",
		title: "My Page",
		type: "page",
		version: { number: 4 },
		body: {
			atlas_doc_format: { value: '{"type":"doc2"}', representation: "atlas_doc_format" },
		},
	});

	const putCall = fetchMock.mock.calls.find(
		([u, init]) =>
			String(u).includes("/wiki/api/v2/pages/123") && (init as RequestInit)?.method === "PUT",
	);
	expect(putCall).toBeDefined();
	const body = JSON.parse(String((putCall![1] as RequestInit).body));
	expect(body).toMatchObject({
		id: "123",
		status: "current",
		title: "My Page",
		version: { number: 4 },
		body: { representation: "atlas_doc_format", value: '{"type":"doc2"}' },
	});
});

test("space key resolution is cached across calls within an invocation", async () => {
	const fetchMock = routedFetch([
		{
			match: "/wiki/api/v2/spaces?keys=PCBF",
			response: () => jsonResponse({ results: [{ id: "900", key: "PCBF" }] }),
		},
		{
			match: "/wiki/api/v2/spaces/900/pages",
			response: () => jsonResponse({ results: [PAGE] }),
		},
	]);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const client = new ConfluenceV2Client(BASE, TOKEN);
	await client.getContent({ type: "page", spaceKey: "PCBF", title: "A" });
	await client.getContent({ type: "page", spaceKey: "PCBF", title: "B" });

	const keyLookups = fetchMock.mock.calls.filter(([u]) =>
		String(u).includes("/wiki/api/v2/spaces?keys=PCBF"),
	);
	expect(keyLookups).toHaveLength(1);
});

test("rejects blog posts", async () => {
	globalThis.fetch = vi.fn() as unknown as typeof fetch;
	const client = new ConfluenceV2Client(BASE, TOKEN);

	await expect(
		client.getContent({ type: "blogpost", spaceKey: "PCBF", title: "X" }),
	).rejects.toThrow(/does not support blog posts/);
});

test("wraps non-2xx responses in ConfluenceV2Error with status and body", async () => {
	globalThis.fetch = routedFetch([
		{
			match: "/wiki/api/v2/pages/123",
			response: () => jsonResponse({ errors: [{ status: 404, title: "Not Found" }] }, 404),
		},
	]) as unknown as typeof fetch;

	const client = new ConfluenceV2Client(BASE, TOKEN);
	const error = await client.getContentById({ id: "123" }).catch((e: unknown) => e);

	expect(error).toBeInstanceOf(ConfluenceV2Error);
	expect((error as ConfluenceV2Error).response.status).toBe(404);
});

test("unsupported methods throw not-implemented errors", async () => {
	const client = new ConfluenceV2Client(BASE, TOKEN);
	expect(() => client.searchContentByCQL()).toThrow(/not implemented/);
	expect(() => client.deleteContent()).toThrow(/not implemented/);
});
