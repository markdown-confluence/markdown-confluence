import type { Client } from "confluence.js/core";
import type { FilePublishResult } from "./Publisher";

/** Reorder explicitly ranked, successfully published siblings only. */
export async function orderPublishedPages(
	client: Client,
	results: FilePublishResult[],
): Promise<void> {
	const groups = new Map<string, { id: string; rank: number }[]>();
	for (const result of results) {
		const file = result.node.file;
		const rank = file.frontmatter["sort-order"];
		if (
			rank === undefined ||
			!result.successfulUploadResult ||
			file.contentType !== "page" ||
			file.dontChangeParentPageId
		)
			continue;
		if (typeof rank !== "number" || !Number.isFinite(rank))
			throw new Error("sort-order must be a finite number");
		const parent = result.node.ancestors.at(-1);
		if (!parent) continue;
		const group = groups.get(parent) ?? [];
		group.push({ id: file.pageId, rank });
		groups.set(parent, group);
	}
	for (const [parent, group] of groups) {
		if (group.length < 2) continue;
		const desired = group
			.sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
			.map((page) => page.id);
		const current: string[] = [];
		for (let cursor: string | undefined; ;) {
			const response = await client.sendRequest<{
				results: { id: string }[];
				limit?: number;
				_links?: { next?: string };
			}>({
				method: "GET",
				url: `/wiki/api/v2/pages/${encodeURIComponent(parent)}/children`,
				searchParams: { ...(cursor ? { cursor } : {}), limit: 100 },
			});
			current.push(...response.results.map((page) => page.id));
			if (!response._links?.next) break;
			if (!response.results.length)
				throw new Error("Page ordering pagination did not advance");
			const nextCursor = new URL(
				response._links.next,
				"https://confluence.invalid",
			).searchParams.get("cursor");
			if (!nextCursor || nextCursor === cursor)
				throw new Error("Page ordering pagination did not advance");
			cursor = nextCursor;
		}
		if (desired.some((id) => !current.includes(id)))
			throw new Error("Page parent changed; refusing to reorder pages across parents");
		if (current.filter((id) => desired.includes(id)).join(",") === desired.join(",")) continue;
		for (let index = 1; index < desired.length; index++)
			await client.sendRequest({
				method: "PUT",
				url: `/wiki/rest/api/content/${encodeURIComponent(desired[index]!)}/move/after/${encodeURIComponent(desired[index - 1]!)}`,
			});
	}
}
