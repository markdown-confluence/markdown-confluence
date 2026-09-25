import { expect, test } from "@effect/vitest";
import type { Client } from "confluence.js/core";
import { resolvedInlineCommentIds } from "./ResolvedInlineComments";

function clientReturning(pages: Record<string, unknown>, requested: string[]): Client {
	return {
		sendRequest: async ({ url }: { url: string }) => {
			requested.push(url);
			return pages[url];
		},
	} as unknown as Client;
}

test("collects marker references across pages of resolved comments", async () => {
	const first = "/wiki/api/v2/blogposts/42/inline-comments?resolution-status=resolved&limit=250";
	const second = "/wiki/api/v2/blogposts/42/inline-comments?cursor=next";
	const requested: string[] = [];
	const client = clientReturning(
		{
			[first]: {
				results: [{ properties: { inlineMarkerRef: "a" } }, { properties: {} }],
				_links: { next: "/api/v2/blogposts/42/inline-comments?cursor=next" },
			},
			[second]: { results: [{ properties: { inlineMarkerRef: "b" } }], _links: {} },
		},
		requested,
	);

	expect(await resolvedInlineCommentIds(client, "42", "blogpost")).toEqual(new Set(["a", "b"]));
	expect(requested).toEqual([first, second]);
});

test("rejects pagination that repeats a page", async () => {
	const first = "/wiki/api/v2/pages/7/inline-comments?resolution-status=resolved&limit=250";
	const client = clientReturning({ [first]: { results: [], _links: { next: first } } }, []);

	await expect(resolvedInlineCommentIds(client, "7", "page")).rejects.toThrow("repeated a page");
});
