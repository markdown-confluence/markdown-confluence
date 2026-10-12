import type { Client } from "confluence.js/core";

type InlineCommentPage = {
	results: { properties?: { inlineMarkerRef?: string } }[];
	_links?: { next?: string };
};

/**
 * Read the marker references of a page's resolved inline comments.
 *
 * A marker reference is the ID carried by the comment's annotation mark in the
 * page ADF. The ADF itself does not say whether a comment is resolved.
 */
export async function resolvedInlineCommentIds(
	client: Client,
	contentId: string,
	contentType: "page" | "blogpost",
): Promise<Set<string>> {
	const collection = contentType === "blogpost" ? "blogposts" : "pages";
	const ids = new Set<string>();
	const visited = new Set<string>();
	let url: string | undefined =
		`/wiki/api/v2/${collection}/${encodeURIComponent(contentId)}/inline-comments?resolution-status=resolved&limit=250`;
	while (url) {
		if (visited.has(url))
			throw new Error("Confluence inline-comment pagination repeated a page");
		visited.add(url);
		const page: InlineCommentPage = await client.sendRequest<InlineCommentPage>({
			method: "GET",
			url,
		});
		for (const comment of page.results) {
			const ref = comment.properties?.inlineMarkerRef;
			if (ref) ids.add(ref);
		}
		const next = page._links?.next;
		url = next ? (next.startsWith("/wiki/") ? next : `/wiki${next}`) : undefined;
	}
	return ids;
}
