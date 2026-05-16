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

function createRootNode(absoluteFilePath: string): LocalAdfFileTreeNode {
	return {
		name: "docs",
		children: [],
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
