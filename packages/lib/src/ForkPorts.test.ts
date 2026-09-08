import { expect, test } from "@effect/vitest";
import { parseMarkdownToADF } from "./MdToADF";
import { shouldPublishMarkdownFile } from "./MarkdownWorkspace";
import { DEFAULT_SETTINGS } from "./Settings";
import { cancellableClient } from "./PublishCancellation";

test("exclusions override tags and frontmatter without excluding similarly named folders", () => {
	const settings = { ...DEFAULT_SETTINGS, folderToPublish: ".", foldersToExclude: ["private/"] };
	expect(
		shouldPublishMarkdownFile("/private/note.md", { "connie-publish": true }, settings),
	).toBe(false);
	expect(shouldPublishMarkdownFile("private-other/note.md", {}, settings)).toBe(true);
});

test("cancellation finishes an active request and rejects subsequent requests", async () => {
	const controller = new AbortController();
	let writes = 0;
	const client = cancellableClient(
		{
			content: {
				async update() {
					writes++;
					controller.abort();
					return "saved";
				},
			},
		},
		controller.signal,
	);
	expect(await client.content.update()).toBe("saved");
	expect(() => client.content.update()).toThrow("Publishing cancelled");
	expect(writes).toBe(1);
});

test("named repeated multiline footnotes preserve code literals and unique backlinks", () => {
	const adf = parseMarkdownToADF(
		"A[^note], again[^note]. `[^note]`\n\n[^note]: First **paragraph**.\n\n    Second paragraph.\n\n```text\n[^note]\n```",
		"https://example.atlassian.net",
	);
	const json = JSON.stringify(adf);
	expect(json).toContain("Second paragraph.");
	expect(json).toContain('"extensionKey":"anchor"');
	expect(json).toContain("-ref-0");
	expect(json).toContain("-ref-1");
	expect(json).toContain('"text":"[^note]"');
	expect(json).toContain('"type":"strong"');
});

test("YAML table scalar values and explicit merged cells are lossless", () => {
	const adf = parseMarkdownToADF(
		'```yaml-table\n- Count: 0\n  Enabled: false\n  Literal: "<"\n- Count: 1\n  Literal: "^"\n```',
		"https://example.atlassian.net",
	);
	expect(JSON.stringify(adf)).toContain('"text":"0"');
	expect(JSON.stringify(adf)).toContain('"text":"false"');
	expect(JSON.stringify(adf)).toContain('"text":"<"');
	const merged = parseMarkdownToADF(
		"```yaml-table\ncolumns: [A, B]\nrows:\n  - [{value: span, colspan: 2}]\n```",
		"https://example.atlassian.net",
	);
	expect(JSON.stringify(merged)).toContain('"colspan":2');
	expect(() =>
		parseMarkdownToADF(
			"```yaml-table\ncolumns: [A]\nrows: [[{value: bad, rowspan: 2}]]\n```",
			"https://example.atlassian.net",
		),
	).toThrow("bounds");
});

test("named excerpt and properties fences preserve body and deterministic IDs", () => {
	const source =
		"```confluence-excerpt summary\n**Body**\n```\n\n```confluence-properties record\n| Key | Value |\n| --- | --- |\n| A | B |\n```";
	const adf = parseMarkdownToADF(source, "https://example.atlassian.net");
	expect(adf.content[0]!.type).toBe("bodiedExtension");
	expect(adf.content[0]!.attrs!["extensionKey"]).toBe("excerpt");
	expect(adf.content[1]!.attrs!["extensionKey"]).toBe("details");
	expect(parseMarkdownToADF(source, "https://example.atlassian.net")).toEqual(adf);
});

import { jiraShorthand } from "./StructuredMarkdown";
import { planPublishingFiles, validatePublishingFiles } from "./PublishingReport";
import { orderPublishedPages } from "./PageOrdering";

test("Jira shorthand preserves formatting and skips code and existing links", () => {
	const adf = parseMarkdownToADF(
		"**Before JIRA: DOCS-1 and JIRA: DOCS-2 after** `JIRA: DOCS-3` [JIRA: DOCS-4](https://example.com)",
		"https://example.atlassian.net",
	);
	jiraShorthand(adf, "https://example.atlassian.net");
	const json = JSON.stringify(adf);
	expect(json).toContain("/browse/DOCS-1");
	expect(json).toContain("/browse/DOCS-2");
	expect(json).not.toContain("/browse/DOCS-3");
	expect(json).not.toContain("/browse/DOCS-4");
	expect(json).toContain('"text":"Before ","marks":[{"type":"strong"}]');
});

const planningFiles = ["one", "two"].map((name) => ({
	folderName: "docs",
	absoluteFilePath: `docs/${name}.md`,
	fileName: `${name}.md`,
	contents: name,
	pageTitle: name,
	frontmatter: {},
}));

test("planning cannot mutate remote pages or local frontmatter", async () => {
	const original = structuredClone(planningFiles);
	const calls: string[] = [];
	const report = await planPublishingFiles(
		planningFiles,
		{ ...DEFAULT_SETTINGS, confluenceParentId: "1" },
		{
			content: {
				getContentById: async () => {
					calls.push("read parent");
					return { id: "1", space: { key: "DOC" } };
				},
				getContent: async () => {
					calls.push("read title");
					return { results: [] };
				},
				createContent: () => {
					throw new Error("Unexpected write");
				},
				updateContent: () => {
					throw new Error("Unexpected write");
				},
			},
		} as never,
	);
	expect(report.pages.map((page) => page.action)).toEqual(["create", "create"]);
	expect(calls).toEqual(["read parent", "read title", "read title"]);
	expect(planningFiles).toEqual(original);
	expect(validatePublishingFiles([], DEFAULT_SETTINGS).valid).toBe(false);
});

test("ordering moves ranked siblings only and skips a correctly ordered tree", async () => {
	const requests: { method: string; url: string }[] = [];
	const client = {
		sendRequest: async (request: { method: string; url: string }) => {
			requests.push(request);
			return { results: [{ id: "2" }, { id: "3" }] };
		},
	};
	const results = [2, 3].map((id) => ({
		successfulUploadResult: {},
		node: {
			ancestors: ["1"],
			file: { pageId: String(id), contentType: "page", frontmatter: { "sort-order": id } },
		},
	}));
	await orderPublishedPages(client as never, results as never);
	expect(requests.map((request) => request.method)).toEqual(["GET"]);
	results[0]!.node.file.frontmatter["sort-order"] = 4;
	await orderPublishedPages(client as never, results as never);
	expect(requests.at(-1)!.url).toContain("/2/move/after/3");
});

test("ordering follows v2 cursors without treating cursors as request URLs", async () => {
	const requests: { url: string; searchParams?: { cursor?: string } }[] = [];
	const client = {
		sendRequest: async (request: { url: string; searchParams?: { cursor?: string } }) => {
			requests.push(request);
			return request.searchParams?.cursor
				? { results: [{ id: "3" }] }
				: {
						results: [{ id: "2" }],
						_links: { next: "/wiki/api/v2/pages/1/children?cursor=next-page" },
					};
		},
	};
	const results = [2, 3].map((id) => ({
		successfulUploadResult: {},
		node: {
			ancestors: ["1"],
			file: { pageId: String(id), contentType: "page", frontmatter: { "sort-order": id } },
		},
	}));
	await orderPublishedPages(client as never, results as never);
	expect(requests.map((request) => request.url)).toEqual([
		"/wiki/api/v2/pages/1/children",
		"/wiki/api/v2/pages/1/children",
	]);
	expect(requests[1]!.searchParams?.cursor).toBe("next-page");
});
