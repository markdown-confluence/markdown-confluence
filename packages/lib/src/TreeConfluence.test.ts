import { expect, test } from "vite-plus/test";
import { doc, p } from "@atlaskit/adf-utils/builders";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { ConfluenceSettings } from "./Settings";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import { LocalAdfFileTreeNode } from "./Publisher";
import {
	BinaryFile,
	FilesToUpload,
	LoaderAdaptor,
	MarkdownFile,
	RequiredConfluenceClient,
} from "./adaptors";

test("writes the parent page id back to a markdown-backed root page", async () => {
	const updateCalls: UpdateCall[] = [];
	const adaptor = new TestAdaptor(updateCalls);

	const pages = await ensureAllFilesExistInConfluence(
		{} as RequiredConfluenceClient,
		adaptor,
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
	const adaptor = new TestAdaptor(updateCalls);

	const pages = await ensureAllFilesExistInConfluence(
		{} as RequiredConfluenceClient,
		adaptor,
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

class TestAdaptor implements LoaderAdaptor {
	constructor(private readonly updateCalls: UpdateCall[]) {}

	async updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePerPageAllValues>,
	): Promise<void> {
		this.updateCalls.push({ absoluteFilePath, values });
	}

	async loadMarkdownFile(_absoluteFilePath: string): Promise<MarkdownFile> {
		throw new Error("Method not implemented.");
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		throw new Error("Method not implemented.");
	}

	async readBinary(_path: string, _referencedFromFilePath: string): Promise<BinaryFile | false> {
		throw new Error("Method not implemented.");
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
