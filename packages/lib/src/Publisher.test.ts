/* eslint-disable @typescript-eslint/naming-convention */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { expect, test } from "@effect/vitest";
import { ConfluenceClient } from "confluence.js";
import { Effect } from "effect";
import SparkMD5 from "spark-md5";
import { orderMarks } from "./AdfEqual";
import { ADFProcessingPlugin, PublisherFunctions } from "./ADFProcessingPlugins";
import { UploadedImageData } from "./Attachments";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { ConfluenceAdfFile, Publisher, UploadAdfFileResult } from "./Publisher";
import { loadConfluenceSettings } from "./SettingsConfig";
import { ConfluenceSettings } from "./Settings";
import { parseMarkdownToADF } from "./MdToADF";
import {
	ChartData,
	MermaidRenderer,
	MermaidRendererPlugin,
} from "./ADFProcessingPlugins/MermaidRendererPlugin";
import {
	MarkdownConfluencePlatform,
	RuntimeEnvironmentLive,
	RuntimeEnvironmentService,
	runEffect,
} from "./effects";
import {
	BinaryFile,
	FilesToUpload,
	MarkdownFile,
	MarkdownWorkspace,
	MarkdownWorkspaceService,
} from "./MarkdownWorkspace";

const confluenceIntegrationTestsEnabled = Effect.runSync(
	Effect.gen(function* () {
		const runtimeEnvironment = yield* RuntimeEnvironmentService;
		const enabled = yield* runtimeEnvironment.getEnv("CONFLUENCE_INTEGRATION_TESTS");
		return enabled === "true";
	}).pipe(Effect.provide(RuntimeEnvironmentLive)),
);
const confluenceIntegrationTest = confluenceIntegrationTestsEnabled ? test : test.skip;

const pngBytes = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
	"base64",
);

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
			description: "A Markdown file demonstrating different header levels.",
		},
	},
	{
		folderName: "emphasis",
		absoluteFilePath: "/path/to/emphasis.md",
		fileName: "emphasis.md",
		contents:
			"*Italic text*\n\n_Italic text_\n\n**Bold text**\n\n__Bold text__\n\n***Bold and italic text***\n\n___Bold and italic text___",
		pageTitle: "Emphasis",
		frontmatter: {
			title: "Emphasis",
			description: "A Markdown file demonstrating different text emphasis styles.",
		},
	},
	{
		folderName: "lists",
		absoluteFilePath: "/path/to/lists.md",
		fileName: "lists.md",
		contents:
			"1. First ordered list item\n2. Second ordered list item\n\n- Unordered list item\n- Another unordered list item",
		pageTitle: "Lists",
		frontmatter: {
			title: "Lists",
			description: "A Markdown file demonstrating ordered and unordered lists.",
		},
	},
	{
		folderName: "links",
		absoluteFilePath: "/path/to/links.md",
		fileName: "links.md",
		contents:
			'[Example link](https://example.com)\n\n[Example link with title](https://example.com "Example Title")',
		pageTitle: "Links",
		frontmatter: {
			title: "Links",
			description: "A Markdown file demonstrating different link styles.",
		},
	},
	/*
	{
		folderName: "images",
		absoluteFilePath: "/path/to/images.md",
		fileName: "images.md",
		contents:
			'![Alt text](/path/to/image.jpg)\n\n![Alt text with title](/path/to/image.jpg "Image Title")',
		pageTitle: "Images",
		frontmatter: {
			title: "Images",
			description:
				"A Markdown file demonstrating different image styles.",
		},
	},
	*/
	{
		folderName: "code",
		absoluteFilePath: "/path/to/code.md",
		fileName: "code.md",
		contents: "Inline `code` example\n\n```\nCode block example\n```",
		pageTitle: "Code",
		frontmatter: {
			title: "Code",
			description: "A Markdown file demonstrating inline code and code blocks.",
		},
	},
	{
		folderName: "tables",
		absoluteFilePath: "/path/to/tables.md",
		fileName: "tables.md",
		contents: "| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |",
		pageTitle: "Tables",
		frontmatter: {
			title: "Tables",
			description: "A Markdown file demonstrating tables.",
		},
	},
	{
		folderName: "blockquotes",
		absoluteFilePath: "/path/to/blockquotes.md",
		fileName: "blockquotes.md",
		contents: "> Blockquote example\n\n> Another blockquote example",
		pageTitle: "Blockquotes",
		frontmatter: {
			title: "Blockquotes",
			description: "A Markdown file demonstrating blockquotes.",
		},
	},
	{
		folderName: "horizontal_rules",
		absoluteFilePath: "/path/to/horizontal_rules.md",
		fileName: "horizontal_rules.md",
		contents: "---\n\n***\n\n___",
		pageTitle: "Horizontal Rules",
		frontmatter: {
			title: "Horizontal Rules",
			description: "A Markdown file demonstrating different horizontal rule styles.",
		},
	},
	/*
	{
		folderName: "inline_html",
		absoluteFilePath: "/path/to/inline_html.md",
		fileName: "inline_html.md",
		contents:
			"<p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>",
		pageTitle: "Inline HTML",
		frontmatter: {
			title: "Inline HTML",
			description:
				"A Markdown file demonstrating the use of inline HTML.",
		},
	},
	*/
	{
		folderName: "escaping",
		absoluteFilePath: "/path/to/escaping.md",
		fileName: "escaping.md",
		contents: "\\*Escape asterisks\\*\n\n\\[Escape brackets\\]",
		pageTitle: "Escaping",
		frontmatter: {
			title: "Escaping",
			description: "A Markdown file demonstrating how to escape special characters.",
		},
	},
	{
		folderName: "folder1",
		absoluteFilePath: "/path/to/folder1/file1.md",
		fileName: "file1.md",
		contents: "# Test Content\nHello, World!",
		pageTitle: "Test Page",
		frontmatter: {
			"connie-title": "Custom Title",
			"connie-frontmatter-to-publish": ["author", "date"],
			author: "John Doe",
			date: "2023-04-14",
			tags: ["test", "example"],
			//			"connie-page-id": "12345",
			//			"connie-dont-change-parent-page": true,
		},
	},
	{
		folderName: "folder2",
		absoluteFilePath: "/path/to/folder2/file2.md",
		fileName: "file2.md",
		contents: "## Another Test\nThis is another test.",
		pageTitle: "Another Test Page",
		frontmatter: {
			"connie-title": "Another Custom Title",
			"connie-frontmatter-to-publish": ["project"],
			project: "Project Name",
			tags: ["demo", 42],
			//			"connie-page-id": 67890,
			//			"connie-dont-change-parent-page": false,
		},
	},
	{
		folderName: "folder3",
		absoluteFilePath: "/path/to/folder3/file3.md",
		fileName: "file3.md",
		contents: "### Third Test\nYet another test content.",
		pageTitle: "Third Test Page",
		frontmatter: {
			"connie-title": 98765,
			"connie-frontmatter-to-publish": [],
			tags: ["sample", "test"],
			//			"connie-page-id": "qwerty",
			//			"connie-dont-change-parent-page": "invalid",
		},
	},
];

class TestMermaidRenderer implements MermaidRenderer {
	constructor(private readonly imageBuffer?: Buffer) {}

	async captureMermaidCharts(charts: ChartData[]): Promise<Map<string, Buffer>> {
		const capturedCharts = new Map<string, Buffer>();
		if (!this.imageBuffer) {
			return capturedCharts;
		}

		for (const chart of charts) {
			capturedCharts.set(chart.name, this.imageBuffer);
		}
		return capturedCharts;
	}
}

class InMemoryMarkdownWorkspace implements MarkdownWorkspace {
	readonly getMarkdownFilesToUpload: Effect.Effect<FilesToUpload, Error>;

	constructor(private readonly inMemoryFiles: MarkdownFile[]) {
		this.getMarkdownFilesToUpload = Effect.succeed(inMemoryFiles);
	}

	updateMarkdownValues(
		_absoluteFilePath: string,
		_values: Partial<ConfluencePerPageAllValues>,
	): Effect.Effect<void, Error> {
		return Effect.void;
	}

	loadMarkdownFile(absoluteFilePath: string): Effect.Effect<MarkdownFile, Error> {
		const file = this.inMemoryFiles.find((item) => item.absoluteFilePath === absoluteFilePath);
		if (!file) {
			return Effect.fail(
				new Error(`Missing markdown file in test workspace: ${absoluteFilePath}`),
			);
		}
		return Effect.succeed(file);
	}

	readBinary(
		_path: string,
		_referencedFromFilePath: string,
	): Effect.Effect<false | BinaryFile, Error> {
		return Effect.fail(new Error("Method not implemented."));
	}

	readText(_path: string, _referencedFromFilePath: string): Effect.Effect<string | false, Error> {
		return Effect.fail(new Error("Method not implemented."));
	}
}

test("refreshes page version after rendering and uploading Mermaid attachments", async () => {
	const contentUpdates: unknown[] = [];
	const uploadRequests: unknown[] = [];
	const confluenceClient = {
		content: {
			getContentById: async () => ({
				version: {
					number: 7,
				},
			}),
			updateContent: async (details: unknown) => {
				contentUpdates.push(details);
				return {};
			},
		},
		contentAttachments: {
			getAttachments: async () => ({ results: [] }),
		},
		contentLabels: {
			getLabelsForContent: async () => ({ results: [] }),
		},
		sendRequest: async (request: unknown) => {
			uploadRequests.push(request);
			return {
				results: [
					{
						extensions: {
							fileId: "file-id",
						},
						container: {
							id: "page-id",
						},
					},
				],
			};
		},
	} as unknown as RequiredConfluenceClient;

	const publisher = new Publisher(
		{
			confluenceBaseUrl: "https://example.atlassian.net",
		} as never,
		confluenceClient,
		[new MermaidRendererPlugin(new TestMermaidRenderer(pngBytes))],
	);
	(publisher as unknown as { myAccountId: string }).myAccountId = "me";

	const updatePageContentEffect = (
		publisher as unknown as {
			updatePageContentEffect(
				ancestors: string[],
				pageVersionNumber: number,
				existingPageData: {
					adfContent: unknown;
					pageTitle: string;
					ancestors: { id: string }[];
					contentType: string;
				},
				adfFile: ConfluenceAdfFile,
				lastUpdatedBy: string,
			): Effect.Effect<
				UploadAdfFileResult,
				unknown,
				MarkdownConfluencePlatform | MarkdownWorkspaceService
			>;
		}
	).updatePageContentEffect.bind(publisher);

	const result = await runEffect(
		updatePageContentEffect(
			[],
			3,
			{
				adfContent: {
					type: "doc",
					version: 1,
					content: [],
				},
				pageTitle: "Mermaid Page",
				ancestors: [],
				contentType: "page",
			},
			{
				folderName: "",
				absoluteFilePath: "/page.md",
				fileName: "page.md",
				contents: {
					type: "doc",
					version: 1,
					content: [
						{
							type: "codeBlock",
							attrs: {
								language: "mermaid",
							},
							content: [
								{
									type: "text",
									text: "flowchart LR\nA-->B",
								},
							],
						},
					],
				},
				pageTitle: "Mermaid Page",
				frontmatter: {},
				tags: [],
				dontChangeParentPageId: false,
				pageId: "page-id",
				spaceKey: "SPACE",
				pageUrl: "https://example.atlassian.net/wiki/spaces/SPACE/pages/page-id/",
				contentType: "page",
				blogPostDate: undefined,
			},
			"me",
		).pipe(Effect.provideService(MarkdownWorkspaceService, new InMemoryMarkdownWorkspace([]))),
	);

	expect(result.imageResult).toBe("updated");
	expect(uploadRequests.length).toBe(1);
	expect(getContentUpdate(contentUpdates).version.number).toBe(8);
});

function getContentUpdate(contentUpdates: unknown[]): { version: { number: number } } {
	const update = contentUpdates[0] as { version: { number: number } } | undefined;
	if (!update) {
		throw new Error("Missing content update");
	}
	return update;
}

test("reports reused attachments as unchanged without uploading them again", async () => {
	const attachmentBuffer = Buffer.from("unchanged attachment");
	const attachmentHash = md5(attachmentBuffer);
	const uploadRequests: unknown[] = [];

	const { result, updateContentRequests } = await publishSinglePage({
		plugins: [new UploadBufferPlugin("diagram.txt", attachmentBuffer, "text/plain")],
		attachments: [
			{
				title: "diagram.txt",
				filehash: attachmentHash,
				fileId: "existing-file-id",
				collectionName: "contentId-page-id",
			},
		],
		uploadRequests,
	});

	expect(result[0]?.successfulUploadResult?.imageResult).toBe("same");
	expect(uploadRequests).toEqual([]);
	expect(updateContentRequests).toEqual([]);
});

test("keeps the default last-updated-by guard when force overwrite is disabled", async () => {
	const { result, updateContentRequests } = await publishSinglePage({
		markdown: "Local content",
		existingAdf: parseMarkdownToADF("Remote content", testPublishSettings.confluenceBaseUrl),
		lastUpdatedBy: "other-user",
	});

	expect(result[0]?.reason).toContain("Page last updated by another user");
	expect(updateContentRequests).toEqual([]);
});

test("allows publishing over another user's update when force overwrite is enabled", async () => {
	const { result, updateContentRequests } = await publishSinglePage({
		settings: {
			...testPublishSettings,
			forceOverwrite: true,
		},
		markdown: "Local content",
		existingAdf: parseMarkdownToADF("Remote content", testPublishSettings.confluenceBaseUrl),
		lastUpdatedBy: "other-user",
	});

	expect(result[0]?.successfulUploadResult?.contentResult).toBe("updated");
	expect(updateContentRequests).toHaveLength(1);
	expect(updateContentRequests[0]?.version).toEqual({ number: 2 });
});

test("preserves the current page space when the parent page should not change", async () => {
	const { updateContentRequests } = await publishSinglePage({
		markdown: "Local content",
		existingAdf: parseMarkdownToADF("Remote content", testPublishSettings.confluenceBaseUrl),
		pageSpaceKey: "SHARED",
		dontChangeParentPageId: true,
	});

	expect(updateContentRequests).toHaveLength(1);
	expect(updateContentRequests[0]?.ancestors).toBeUndefined();
	expect(updateContentRequests[0]?.space).toEqual({ key: "SHARED" });
});

test("refetches the page version and retries content updates after a conflict", async () => {
	let latestVersion = 2;
	let shouldConflict = true;
	const { updateContentRequests } = await publishSinglePage({
		markdown: "Local content",
		existingAdf: parseMarkdownToADF("Remote content", testPublishSettings.confluenceBaseUrl),
		initialVersion: latestVersion,
		getLatestVersion: () => latestVersion,
		updateContent: async (request) => {
			if (shouldConflict) {
				shouldConflict = false;
				latestVersion = 3;
				throw Object.assign(new Error("Version conflict"), {
					response: { status: 409 },
				});
			}
			latestVersion = request.version.number;
			return request;
		},
	});

	expect(updateContentRequests.map((request) => request.version.number)).toEqual([3, 4]);
});

confluenceIntegrationTest(
	"Upload to Confluence",
	async () => {
		const settings = await loadConfluenceSettings();
		const workspace = new InMemoryMarkdownWorkspace(markdownTestCases);
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
		const contentByTitle = await confluenceClient.content.getContent(searchParams);

		const pageResult = contentByTitle.results[0];
		if (!pageResult) {
			throw new Error("Missing Parent Page");
		}
		settings.confluenceParentId = pageResult.id;

		const publisher = new Publisher(settings, confluenceClient, [
			new MermaidRendererPlugin(mermaidRenderer),
		]);

		const result = await runEffect(
			publisher
				.publishEffect()
				.pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
		);

		for (const uploadResult of result) {
			const afterUpload = await confluenceClient.content.getContentById({
				id: uploadResult.node.file.pageId,
				expand: ["body.atlas_doc_format", "space"],
			});

			const uploadedAdf = orderMarks(
				JSON.parse(afterUpload.body?.atlas_doc_format?.value ?? "{}"),
			);
			const returnedAdf = orderMarks(uploadResult.node.file.contents);

			expect(returnedAdf).toEqual(uploadedAdf);
		}
	},
	300000,
);

class UploadBufferPlugin implements ADFProcessingPlugin<undefined, UploadedImageData | null> {
	constructor(
		private readonly uploadFilename: string,
		private readonly buffer: Buffer,
		private readonly contentType: string,
	) {}

	extract(): undefined {
		return undefined;
	}

	async transform(
		_items: undefined,
		supportFunctions: PublisherFunctions,
	): Promise<UploadedImageData | null> {
		return supportFunctions.uploadBuffer(this.uploadFilename, this.buffer, this.contentType);
	}

	load(adf: JSONDocNode): JSONDocNode {
		return adf;
	}
}

type AttachmentFixture = {
	title: string;
	filehash: string;
	fileId: string;
	collectionName: string;
};

type UpdateContentRequest = {
	id: string;
	title: string;
	type: string;
	version: { number: number };
	body: {
		atlas_doc_format: {
			value: string;
			representation: string;
		};
	};
	ancestors?: { id: string }[];
	space?: { key: string };
};

async function publishSinglePage({
	settings = testPublishSettings,
	markdown = "Hello",
	existingAdf = parseMarkdownToADF(markdown, settings.confluenceBaseUrl),
	lastUpdatedBy = "current-user",
	initialVersion = 1,
	pageSpaceKey = "SPACE",
	existingAncestors = [{ id: "parent-id" }],
	dontChangeParentPageId = false,
	plugins = [],
	attachments = [],
	uploadRequests = [],
	getLatestVersion = () => initialVersion,
	updateContent = async (request) => request,
}: {
	settings?: ConfluenceSettings;
	markdown?: string;
	existingAdf?: JSONDocNode;
	lastUpdatedBy?: string;
	initialVersion?: number;
	pageSpaceKey?: string;
	existingAncestors?: { id: string }[];
	dontChangeParentPageId?: boolean;
	plugins?: ADFProcessingPlugin<unknown, unknown>[];
	attachments?: AttachmentFixture[];
	uploadRequests?: unknown[];
	getLatestVersion?: () => number;
	updateContent?: (request: UpdateContentRequest) => Promise<unknown>;
} = {}) {
	const updateContentRequests: UpdateContentRequest[] = [];
	const confluenceClient = makePublisherTestConfluenceClient({
		existingAdf,
		lastUpdatedBy,
		initialVersion,
		pageSpaceKey,
		existingAncestors,
		attachments,
		uploadRequests,
		getLatestVersion,
		updateContent: async (request) => {
			updateContentRequests.push(request);
			return updateContent(request);
		},
	});
	const workspace = new InMemoryMarkdownWorkspace([
		{
			folderName: "docs",
			absoluteFilePath: "/docs/page.md",
			fileName: "page.md",
			contents: markdown,
			pageTitle: "Page",
			frontmatter: {
				"connie-page-id": "page-id",
				"connie-dont-change-parent-page": dontChangeParentPageId,
			},
		},
	]);
	const publisher = new Publisher(settings, confluenceClient, plugins);

	const result = await runEffect(
		publisher.publishEffect().pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
	);

	return {
		result,
		updateContentRequests,
	};
}

function makePublisherTestConfluenceClient({
	existingAdf,
	lastUpdatedBy,
	initialVersion,
	pageSpaceKey,
	existingAncestors = [{ id: "parent-id" }],
	attachments,
	uploadRequests,
	getLatestVersion,
	updateContent,
}: {
	existingAdf: JSONDocNode;
	lastUpdatedBy: string;
	initialVersion: number;
	pageSpaceKey: string;
	existingAncestors?: { id: string }[];
	attachments: AttachmentFixture[];
	uploadRequests: unknown[];
	getLatestVersion: () => number;
	updateContent: (request: UpdateContentRequest) => Promise<unknown>;
}): RequiredConfluenceClient {
	return {
		users: {
			getCurrentUser: async () => ({ accountId: "current-user" }),
		},
		content: {
			getContentById: async ({ id, expand }: { id: string; expand?: string[] }) => {
				if (id === "parent-id") {
					return {
						id: "parent-id",
						space: { key: "SPACE" },
					};
				}

				const versionNumber =
					expand?.length === 1 && expand[0] === "version"
						? getLatestVersion()
						: initialVersion;

				return {
					id: "page-id",
					title: "Page",
					type: "page",
					version: {
						number: versionNumber,
						by: { accountId: lastUpdatedBy },
					},
					body: {
						// eslint-disable-next-line @typescript-eslint/naming-convention
						atlas_doc_format: {
							value: JSON.stringify(existingAdf),
						},
					},
					ancestors: existingAncestors,
					space: { key: pageSpaceKey },
				};
			},
			updateContent,
		},
		contentAttachments: {
			getAttachments: async () => ({
				results: attachments.map((attachment) => ({
					title: attachment.title,
					metadata: { comment: attachment.filehash },
					extensions: {
						fileId: attachment.fileId,
						collectionName: attachment.collectionName,
					},
				})),
			}),
			createOrUpdateAttachments: async (request: unknown) => {
				uploadRequests.push(request);
				return {
					results: [
						{
							extensions: {
								fileId: "new-file-id",
							},
							container: {
								id: "page-id",
							},
						},
					],
				};
			},
		},
		contentLabels: {
			getLabelsForContent: async () => ({ results: [] }),
			removeLabelFromContentUsingQueryParameter: async () => undefined,
			addLabelsToContent: async () => undefined,
		},
	} as unknown as RequiredConfluenceClient;
}

function md5(contents: Buffer): string {
	const spark = new SparkMD5.ArrayBuffer();
	return spark.append(Uint8Array.from(contents).buffer).end();
}

test("publishes a large collection without exceeding two concurrent page updates", async () => {
	let active = 0;
	let peak = 0;
	const count = 32;
	const client = makePublisherTestConfluenceClient({
		existingAdf: parseMarkdownToADF("Before", testPublishSettings.confluenceBaseUrl),
		lastUpdatedBy: "current-user",
		initialVersion: 1,
		pageSpaceKey: "SPACE",
		attachments: [],
		uploadRequests: [],
		getLatestVersion: () => 1,
		updateContent: async (request) => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active--;
			return request;
		},
	});
	const getContentById = client.content.getContentById.bind(client.content);
	client.content.getContentById = (async (request: { id: string; expand?: string[] }) => {
		const page = await getContentById(request);
		return request.id === "parent-id" ? page : { ...page, id: request.id, title: request.id };
	}) as typeof client.content.getContentById;
	const workspace = new InMemoryMarkdownWorkspace(
		Array.from({ length: count }, (_, index) => ({
			folderName: "docs",
			absoluteFilePath: `/docs/page-${index}.md`,
			fileName: `page-${index}.md`,
			pageTitle: `page-${index}`,
			contents: "After",
			frontmatter: { "connie-page-id": `page-${index}` },
		})),
	);
	const progress: string[] = [];
	const publisher = new Publisher(testPublishSettings, client, [], (message) =>
		progress.push(message),
	);
	const results = await runEffect(
		publisher.publishEffect().pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
	);
	expect(results).toHaveLength(count);
	expect(
		results.every((result) => result.successfulUploadResult?.contentResult === "updated"),
	).toBe(true);
	expect(peak).toBe(2);
	expect(active).toBe(0);
	expect(progress[0]).toBe("Connecting to Confluence");
	expect(progress.filter((message) => message.startsWith("Publishing "))).toHaveLength(count);
});

const testPublishSettings: ConfluenceSettings = {
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "parent-id",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
};

test("preserves unchanged pages when the publishing parent has higher ancestors", async () => {
	const { result, updateContentRequests } = await publishSinglePage({
		existingAncestors: [{ id: "space-home" }, { id: "parent-id" }],
	});
	expect(result[0]?.successfulUploadResult?.contentResult).toBe("same");
	expect(updateContentRequests).toEqual([]);
});

test("moves a page when its immediate parent differs", async () => {
	const { result, updateContentRequests } = await publishSinglePage({
		existingAncestors: [{ id: "parent-id" }, { id: "old-folder" }],
	});
	expect(result[0]?.successfulUploadResult?.contentResult).toBe("updated");
	expect(updateContentRequests[0]?.ancestors).toEqual([{ id: "parent-id" }]);
});
