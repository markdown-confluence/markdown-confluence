import { expect, test } from "@effect/vitest";
import { doc, p } from "@atlaskit/adf-utils/builders";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { Effect } from "effect";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import { LocalAdfFileTreeNode } from "./Publisher";
import { BinaryFile, FilesToUpload, MarkdownFile, MarkdownWorkspace } from "./MarkdownWorkspace";

test("publishes a markdown-backed root page as the configured parent page", async () => {
	const updateCalls: UpdateCall[] = [];
	const workspace = new TestMarkdownWorkspace(updateCalls);
	const confluenceClient = createConfluenceClientWithPages({
		"123456": createContentPage({
			id: "123456",
			title: "Docs Home",
			spaceKey: "SPACE",
			ancestors: [{ id: "space-root" }],
		}),
	});

	const pages = await ensureAllFilesExistInConfluence(
		confluenceClient,
		workspace,
		createRootNode("docs/index.md"),
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);

	expect(pages.map((page) => page.file.pageId)).toEqual(["123456"]);
	expect(pages[0]?.file.pageTitle).toBe("Docs Home");
	expect(pages[0]?.ancestors).toEqual(["space-root"]);
	expect(updateCalls).toEqual([
		{
			absoluteFilePath: "docs/index.md",
			values: {
				publish: true,
				pageId: "123456",
				pageUrl: "https://example.atlassian.net/wiki/spaces/SPACE/pages/123456/",
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

test("replaces stale page ids with one final metadata update after title resolution", async () => {
	const updateCalls: UpdateCall[] = [];
	const workspace = new TestMarkdownWorkspace(updateCalls);
	const notFound = Object.assign(new Error("Not Found"), {
		response: { status: 404 },
	});
	const parentPage = createContentPage({
		id: "123456",
		title: "Docs Home",
		spaceKey: "SPACE",
		ancestors: [{ id: "space-root" }],
	});
	const confluenceClient = {
		content: {
			getContentById: async ({ id }: { id: string }) => {
				if (id === parentPage.id) {
					return parentPage;
				}
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

	expect(pages.map((page) => page.file.pageId)).toEqual(["123456", "new-child-page"]);
	expect(updateCalls).toEqual([
		{
			absoluteFilePath: "docs/index.md",
			values: {
				publish: true,
				pageId: "123456",
				pageUrl: "https://example.atlassian.net/wiki/spaces/SPACE/pages/123456/",
			},
		},
		{
			absoluteFilePath: "docs/child.md",
			values: {
				publish: true,
				pageId: "new-child-page",
				pageUrl: "https://example.atlassian.net/wiki/spaces/SPACE/pages/new-child-page/",
			},
		},
	]);
});

test("creates children in the space resolved from an explicit parent page id", async () => {
	const updateCalls: UpdateCall[] = [];
	const workspace = new TestMarkdownWorkspace(updateCalls);
	const createContentCalls: unknown[] = [];
	const confluenceClient = {
		content: {
			getContentById: async ({ id }: { id: string }) => {
				if (id === "123456") {
					return createContentPage({
						id: "123456",
						title: "Docs Home",
						spaceKey: "SPACE",
					});
				}
				return createContentPage({
					id: "other-space-parent",
					title: "Other Space Parent",
					spaceKey: "OTHER",
				});
			},
			getContent: async () => ({ results: [] }),
			createContent: async (request: unknown) => {
				createContentCalls.push(request);
				return createContentPage({
					id: "other-space-child",
					title: "Child",
					spaceKey: "OTHER",
					ancestors: [{ id: "other-space-parent" }],
				});
			},
		},
	} as unknown as RequiredConfluenceClient;

	const pages = await ensureAllFilesExistInConfluence(
		confluenceClient,
		workspace,
		createRootNode("docs/index.md", [
			createRootNode(
				"docs/other-parent.md",
				[
					createRootNode("docs/child.md", {
						absoluteFilePath: "docs/child.md",
						pageTitle: "Child",
					}),
				],
				{
					absoluteFilePath: "docs/other-parent.md",
					pageId: "other-space-parent",
					pageTitle: "Other Space Parent",
				},
			),
		]),
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);

	expect(pages.map((page) => [page.file.pageId, page.file.spaceKey])).toEqual([
		["123456", "SPACE"],
		["other-space-parent", "OTHER"],
		["other-space-child", "OTHER"],
	]);
	expect(pages[1]?.ancestors).toEqual([]);
	expect(pages[2]?.ancestors).toEqual(["other-space-parent"]);
	expect(createContentCalls).toMatchObject([
		{
			space: { key: "OTHER" },
			ancestors: [{ id: "other-space-parent" }],
			title: "Child",
		},
	]);
});

test("resolves existing descendants in an explicitly selected cross-space parent tree", async () => {
	const updateCalls: UpdateCall[] = [];
	const lookups: unknown[] = [];
	const client = {
		content: {
			getContentById: async ({ id }: { id: string }) =>
				createContentPage({
					id,
					title: "Other parent",
					spaceKey: "OTHER",
					ancestors: [{ id: "other-home" }],
				}),
			getContent: async (request: unknown) => {
				lookups.push(request);
				return {
					results: [
						createContentPage({
							id: "other-child",
							title: "Child",
							spaceKey: "OTHER",
							ancestors: [{ id: "other-parent" }],
						}),
					],
				};
			},
		},
	} as unknown as RequiredConfluenceClient;
	const pages = await ensureAllFilesExistInConfluence(
		client,
		new TestMarkdownWorkspace(updateCalls),
		createRootNode("docs", [
			createRootNode(
				"docs/other/index.md",
				[createRootNode("docs/other/child.md", { pageTitle: "Child" })],
				{ pageId: "other-parent" },
			),
		]),
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);
	expect(lookups).toMatchObject([{ title: "Child", spaceKey: "OTHER" }]);
	expect(
		pages.map((page) => ({
			id: page.file.pageId,
			space: page.file.spaceKey,
			ancestors: page.ancestors,
		})),
	).toEqual([
		{ id: "other-parent", space: "OTHER", ancestors: ["other-home"] },
		{ id: "other-child", space: "OTHER", ancestors: ["other-parent"] },
	]);
	expect(updateCalls).toHaveLength(2);
});

test("discovers nested missing pages before creating their hierarchy and committing metadata", async () => {
	const updateCalls: UpdateCall[] = [];
	const events: string[] = [];
	const client = {
		content: {
			getContent: async ({ title }: { title: string }) => {
				events.push(`find ${title}`);
				return { results: [] };
			},
			createContent: async ({
				title,
				ancestors,
			}: {
				title: string;
				ancestors: { id: string }[];
			}) => {
				events.push(`create ${title} under ${ancestors[0]?.id}`);
				return createContentPage({ id: title, title, spaceKey: "SPACE", ancestors });
			},
		},
	} as unknown as RequiredConfluenceClient;
	const pages = await ensureAllFilesExistInConfluence(
		client,
		new TestMarkdownWorkspace(updateCalls),
		createRootNode("docs", [
			createRootNode(
				"docs/parent",
				[createRootNode("docs/parent/child.md", { pageTitle: "Child" })],
				{ pageTitle: "Parent" },
			),
		]),
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);
	expect(events).toEqual([
		"find Parent",
		"find Child",
		"create Parent under 123456",
		"create Child under Parent",
	]);
	expect(pages.map((page) => page.ancestors)).toEqual([["123456"], ["123456", "Parent"]]);
	expect(updateCalls.map((call) => call.absoluteFilePath)).toEqual(["docs/parent/child.md"]);
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

	readText(_path: string, _referencedFromFilePath: string): Effect.Effect<string | false, Error> {
		return Effect.fail(new Error("Method not implemented."));
	}
}

function createRootNode(
	absoluteFilePath: string,
	childrenOrOverrides:
		| LocalAdfFileTreeNode[]
		| Partial<NonNullable<LocalAdfFileTreeNode["file"]>> = [],
	overridesWhenChildren: Partial<NonNullable<LocalAdfFileTreeNode["file"]>> = {},
): LocalAdfFileTreeNode {
	const children = Array.isArray(childrenOrOverrides) ? childrenOrOverrides : [];
	const overrides = Array.isArray(childrenOrOverrides)
		? overridesWhenChildren
		: childrenOrOverrides;

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

function createConfluenceClientWithPages(
	pagesById: Record<string, ReturnType<typeof createContentPage>>,
): RequiredConfluenceClient {
	return {
		content: {
			getContentById: async ({ id }: { id: string }) => pagesById[id],
		},
	} as unknown as RequiredConfluenceClient;
}

function createContentPage({
	id,
	title,
	spaceKey,
	ancestors = [],
}: {
	id: string;
	title: string;
	spaceKey: string;
	ancestors?: { id: string }[];
}) {
	return {
		id,
		title,
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
				value: JSON.stringify(doc(p("Existing page"))),
			},
		},
		ancestors,
		space: {
			key: spaceKey,
		},
	};
}

const testSettings: ConfluenceSettings = {
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceSiteUrl: "",
	confluenceParentId: "123456",
	confluenceAuthType: "basic",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	atlassianClientId: "",
	atlassianClientSecret: "",
	folderToPublish: ".",
	tagsToPublish: "",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
};

test("bounds hierarchy requests across wide and nested folders", async () => {
	let active = 0;
	let peak = 0;
	let pageCount = 0;
	const branch = (prefix: string, depth: number): LocalAdfFileTreeNode => {
		pageCount++;
		return createRootNode(
			`docs/${prefix}.md`,
			depth > 0
				? Array.from({ length: 3 }, (_, index) => branch(`${prefix}-${index}`, depth - 1))
				: [],
			{ pageId: prefix, pageTitle: prefix },
		);
	};
	const root = createRootNode(
		"docs/Generated",
		Array.from({ length: 3 }, (_, index) => branch(`page-${index}`, 2)),
	);
	const client = {
		content: {
			getContentById: async ({ id }: { id: string }) => {
				active++;
				peak = Math.max(peak, active);
				await new Promise((resolve) => setTimeout(resolve, 2));
				active--;
				return createContentPage({
					id,
					title: id,
					spaceKey: "SPACE",
					ancestors: [{ id: "123456" }],
				});
			},
		},
	} as unknown as RequiredConfluenceClient;
	const pages = await ensureAllFilesExistInConfluence(
		client,
		new TestMarkdownWorkspace([]),
		root,
		"SPACE",
		"123456",
		"123456",
		testSettings,
	);
	expect(pages).toHaveLength(pageCount);
	expect(peak).toBe(1);
	expect(active).toBe(0);
});
