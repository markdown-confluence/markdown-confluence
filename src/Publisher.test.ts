/* eslint-disable @typescript-eslint/naming-convention */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { expect, test } from "@jest/globals";
import { ConfluenceClient } from "confluence.js";
import {
	BinaryFile,
	FilesToUpload,
	LoaderAdaptor,
	MarkdownFile,
} from "./adaptors/types";
import { ChartData, MermaidRenderer } from "./mermaid_renderers";
import { Publisher } from "./Publisher";
import { MyPluginSettings } from "./Settings";

const settings: MyPluginSettings = {
	confluenceBaseUrl: process.env.ATLASSIAN_SITE_URL ?? "MISSING SITE",
	confluenceParentId: "",
	atlassianUserName: process.env.ATLASSIAN_USERNAME ?? "NO EMAIL",
	atlassianApiToken: process.env.ATLASSIAN_API_TOKEN ?? "NO TOKEN",
	folderToPublish: "Confluence Files",
};

class TestMermaidRenderer implements MermaidRenderer {
	async captureMermaidCharts(
		charts: ChartData[]
	): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();
		return capturedCharts;
	}
}

class InMemoryAdaptor implements LoaderAdaptor {
	private inMemoryFiles: MarkdownFile[];

	constructor(inMemoryFiles: MarkdownFile[]) {
		this.inMemoryFiles = inMemoryFiles;
	}

	async updateMarkdownPageId(
		absoluteFilePath: string,
		id: string
	): Promise<void> {}
	async loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile> {
		return this.inMemoryFiles[0];
	}
	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		return this.inMemoryFiles;
	}

	async readBinary(
		path: string,
		referencedFromFilePath: string
	): Promise<false | BinaryFile> {
		throw new Error("Method not implemented.");
	}
}

test("Upload to Confluence", async () => {
	const markdownTestCases: MarkdownFile[] = [
		{
			folderName: "headers",
			absoluteFilePath: "/path/to/headers.md",
			fileName: "headers.md",
			contents:
				"# Header 1\n\n## Header 2\n\n### Header 3\n\n#### Header 4\n\n##### Header 5\n\n###### Header 6",
			pageTitle: "Headers",
			frontmatter: {
				title: "Headers",
				description:
					"A Markdown file demonstrating different header levels.",
			},
		},
		{
			folderName: "tables",
			absoluteFilePath: "/path/to/tables.md",
			fileName: "tables.md",
			contents:
				"| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |",
			pageTitle: "Tables",
			frontmatter: {
				title: "Tables",
				description: "A Markdown file demonstrating tables.",
			},
		},
	];

	const filesystemAdaptor = new InMemoryAdaptor(markdownTestCases);
	const mermaidRenderer = new TestMermaidRenderer();
	const confluenceClient = new ConfluenceClient({
		host: settings.confluenceBaseUrl,
		authentication: {
			basic: {
				email: settings.atlassianUserName,
				apiToken: settings.atlassianApiToken,
			},
		},
	});

	const searchParams = {
		type: "page",
		space: "it",
		title: "Test - bf8bb13d-21b4-31b6-4584-8b9683d82086",
		expand: ["version", "body.atlas_doc_format", "ancestors"],
	};
	const contentByTitle = await confluenceClient.content.getContent(
		searchParams
	);

	settings.confluenceParentId = contentByTitle.results[0].id;

	const publisher = new Publisher(
		filesystemAdaptor,
		settings,
		confluenceClient,
		mermaidRenderer
	);

	const result = await publisher.publish();

	for (const uploadResult of result) {
		const afterUpload = await confluenceClient.content.getContentById({
			id: uploadResult.node.file.pageId,
			expand: ["body.atlas_doc_format", "space"],
		});

		expect(
			JSON.parse(afterUpload.body?.atlas_doc_format?.value ?? "{}")
		).toEqual(uploadResult.node.file.contents);
	}
});
