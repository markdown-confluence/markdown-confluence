import { expect, test } from "@effect/vitest";
import { doc, p } from "@atlaskit/adf-utils/builders";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { Effect } from "effect";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { ConfluenceSettings } from "./Settings";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import { LocalAdfFileTreeNode } from "./Publisher";
import { BinaryFile, FilesToUpload, MarkdownFile, MarkdownWorkspace } from "./MarkdownWorkspace";

test("writes the parent page id back to a markdown-backed root page", async () => {
	const updateCalls: UpdateCall[] = [];
	const workspace = new TestMarkdownWorkspace(updateCalls);

	const pages = await ensureAllFilesExistInConfluence(
		{} as RequiredConfluenceClient,
		workspace,
		createRootNode("docs/index.md"),
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);

	expect(pages).toEqual([]);
	expect(updateCalls).toEqual([
		{
			absoluteFilePath: "docs/index.md",
			values: {
				publish: true,
				pageId: "123456",
			},
		},
	]);
});

test("does not try to update generated folder placeholder pages", async () => {
	const updateCalls: UpdateCall[] = [];
	const workspace = new TestMarkdownWorkspace(updateCalls);

	const pages = await ensureAllFilesExistInConfluence(
		{} as RequiredConfluenceClient,
		workspace,
		createRootNode("docs/Generated Folder"),
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);

	expect(pages).toEqual([]);
	expect(updateCalls).toEqual([]);
});

test("clears stale page ids and creates the page by title", async () => {
	const updateCalls: UpdateCall[] = [];
	const workspace = new TestMarkdownWorkspace(updateCalls);
	const notFound = Object.assign(new Error("Not Found"), {
		response: { status: 404 },
	});
	const confluenceClient = {
		content: {
			getContentById: async () => {
				throw notFound;
			},
			getContent: async () => ({ results: [] }),
			createContent: async () => ({
				id: "new-child-page",
				title: "Child",
				type: "page",
				version: {
					number: 1,
					by: {
						accountId: "current-user",
					},
				},
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: JSON.stringify(doc(p("Page not published yet"))),
					},
				},
				ancestors: [{ id: "123456" }],
			}),
		},
	} as unknown as RequiredConfluenceClient;

	const pages = await ensureAllFilesExistInConfluence(
		confluenceClient,
		workspace,
		createRootNode("docs/index.md", [
			createRootNode("docs/child.md", {
				pageId: "stale-child-page",
				pageTitle: "Child",
			}),
		]),
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);

	expect(pages.map((page) => page.file.pageId)).toEqual(["new-child-page"]);
	expect(updateCalls).toEqual([
		{
			absoluteFilePath: "docs/index.md",
			values: {
				publish: true,
				pageId: "123456",
			},
		},
		{
			absoluteFilePath: "docs/child.md",
			values: {
				publish: false,
				pageId: undefined,
			},
		},
		{
			absoluteFilePath: "docs/child.md",
			values: {
				publish: true,
				pageId: "new-child-page",
			},
		},
	]);
});

type UpdateCall = {
	absoluteFilePath: string;
	values: Partial<ConfluencePerPageAllValues>;
};

class TestMarkdownWorkspace implements MarkdownWorkspace {
	readonly getMarkdownFilesToUpload: Effect.Effect<FilesToUpload, Error> = Effect.fail(
		new Error("Method not implemented."),
	);

	constructor(private readonly updateCalls: UpdateCall[]) {}

	updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePerPageAllValues>,
	): Effect.Effect<void, Error> {
		return Effect.sync(() => {
			this.updateCalls.push({ absoluteFilePath, values });
		});
	}

	loadMarkdownFile(_absoluteFilePath: string): Effect.Effect<MarkdownFile, Error> {
		return Effect.fail(new Error("Method not implemented."));
	}

	readBinary(
		_path: string,
		_referencedFromFilePath: string,
	): Effect.Effect<BinaryFile | false, Error> {
		return Effect.fail(new Error("Method not implemented."));
	}
}

function createRootNode(
	absoluteFilePath: string,
	childrenOrOverrides:
		| LocalAdfFileTreeNode[]
		| Partial<NonNullable<LocalAdfFileTreeNode["file"]>> = [],
): LocalAdfFileTreeNode {
	const children = Array.isArray(childrenOrOverrides) ? childrenOrOverrides : [];
	const overrides = Array.isArray(childrenOrOverrides) ? {} : childrenOrOverrides;

	return {
		name: "docs",
		children,
		file: {
			folderName: "docs",
			absoluteFilePath,
			fileName: "index.md",
			contents: doc(p("Root page")) as JSONDocNode,
			pageTitle: "Docs",
			frontmatter: {},
			tags: [],
			pageId: undefined,
			dontChangeParentPageId: false,
			contentType: "page",
			blogPostDate: undefined,
			...overrides,
		},
	};
}

const testSettings: ConfluenceSettings = {
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "123456",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};
