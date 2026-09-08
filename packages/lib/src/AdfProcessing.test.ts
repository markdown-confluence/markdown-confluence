import { expect, test } from "@effect/vitest";
import { TextDefinition } from "@atlaskit/adf-schema";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { prepareAdfToUpload } from "./AdfProcessing";
import { parseMarkdownToADF } from "./MdToADF";
import { ConfluenceAdfFile, ConfluenceNode } from "./Publisher";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";

test("resolves wikilinks that include a path under the publish root", () => {
	const pages = [
		createNode({
			fileName: "source.md",
			absoluteFilePath: "Confluence Pages/source.md",
			contents: docWithLink("Read this", "wikilinks:confluence/note/test"),
		}),
		createNode({
			fileName: "test.md",
			absoluteFilePath: "Confluence Pages/confluence/note/test.md",
			pageId: "123456",
			spaceKey: "SPACE",
		}),
	];

	prepareAdfToUpload(pages, testSettings);

	const link = pages[0]!.file.contents.content[0]!.content![0] as TextDefinition;
	expect(link.marks?.[0]?.attrs?.href).toBe(
		"https://example.atlassian.net/wiki/spaces/SPACE/pages/123456",
	);
});

test("resolves relative markdown links from the current file directory", () => {
	const pages = [
		createNode({
			fileName: "README.md",
			absoluteFilePath: "Confluence Pages/docs/guidebook/README.md",
			contents: docWithLink("Context", "wikilinks:context/README"),
		}),
		createNode({
			fileName: "README.md",
			absoluteFilePath: "Confluence Pages/docs/guidebook/context/README.md",
			pageId: "222222",
			spaceKey: "SPACE",
		}),
	];

	prepareAdfToUpload(pages, testSettings);

	const link = pages[0]!.file.contents.content[0]!.content![0] as TextDefinition;
	expect(link.marks?.[0]?.attrs?.href).toBe(
		"https://example.atlassian.net/wiki/spaces/SPACE/pages/222222",
	);
});

test("resolves same-page heading wikilinks to the current page", () => {
	const pages = [
		createNode({
			fileName: "source.md",
			absoluteFilePath: "Confluence Pages/source.md",
			pageId: "111111",
			spaceKey: "SPACE",
			contents: docWithLink("Overview", "wikilinks:#Overview"),
		}),
	];

	prepareAdfToUpload(pages, testSettings);

	const link = pages[0]!.file.contents.content[0]!.content![0] as TextDefinition;
	expect(link.marks?.[0]?.attrs?.href).toBe(
		"https://example.atlassian.net/wiki/spaces/SPACE/pages/111111#Overview",
	);
});

function docWithLink(text: string, href: string): JSONDocNode {
	return {
		version: 1,
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text,
						marks: [
							{
								type: "link",
								attrs: { href },
							},
						],
					},
				],
			},
		],
	} as JSONDocNode;
}

function createNode(file: Partial<ConfluenceAdfFile>): ConfluenceNode {
	const confluenceFile: ConfluenceAdfFile = {
		folderName: "",
		absoluteFilePath: "Confluence Pages/default.md",
		fileName: "default.md",
		contents: docWithLink("", ""),
		pageTitle: "Default",
		frontmatter: {},
		tags: [],
		dontChangeParentPageId: false,
		pageId: "654321",
		spaceKey: "SPACE",
		pageUrl: "",
		contentType: "page",
		blogPostDate: undefined,
		...file,
	};

	return {
		file: confluenceFile,
		version: 1,
		lastUpdatedBy: "tester",
		existingPageData: {
			adfContent: {
				version: 1,
				type: "doc",
				content: [],
			},
			pageTitle: confluenceFile.pageTitle,
			ancestors: [],
			contentType: "page",
		},
		ancestors: [],
	};
}

const testSettings: ConfluenceSettings = {
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceSiteUrl: "",
	confluenceParentId: "1",
	confluenceAuthType: "basic",
	atlassianUserName: "test@example.com",
	atlassianApiToken: "token",
	atlassianClientId: "",
	atlassianClientSecret: "",
	folderToPublish: "Confluence Pages",
	tagsToPublish: "",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
};

test.each(["Anchor", "Before Anchor"])(
	"preserves a comment at the end of '%s' without adding empty text nodes",
	(paragraph) => {
		const marker = {
			type: "annotation",
			attrs: { annotationType: "inlineComment", id: "existing-comment" },
		};
		const remote = {
			type: "doc",
			version: 1,
			content: [
				{
					type: "paragraph",
					content: [
						...(paragraph.startsWith("Before")
							? [{ type: "text", text: "Before " }]
							: []),
						{ type: "text", text: "Anchor", marks: [marker] },
					],
				},
				{ type: "paragraph", content: [{ type: "text", text: "Old elsewhere" }] },
			],
		} as JSONDocNode;
		const source = {
			type: "doc",
			version: 1,
			content: [
				{ type: "paragraph", content: [{ type: "text", text: paragraph }] },
				{ type: "paragraph", content: [{ type: "text", text: "Updated elsewhere" }] },
			],
		} as JSONDocNode;
		const node = createNode({ contents: structuredClone(source) });
		node.existingPageData.adfContent = remote;
		prepareAdfToUpload([node], testSettings);
		const expected = structuredClone(remote);
		expected.content[1]!.content![0]!.text = "Updated elsewhere";
		expect(node.file.contents).toEqual(expected);
		// Reading the stored result and publishing the same source must retain identical ADF.
		node.existingPageData.adfContent = structuredClone(node.file.contents);
		node.file.contents = structuredClone(source);
		prepareAdfToUpload([node], testSettings);
		expect(node.file.contents).toEqual(expected);
	},
);

test("unresolved formatted wikilinks retain dense formatting marks", () => {
	const contents = docWithLink("Missing", "wikilinks:missing");
	const text = contents.content[0]!.content![0] as TextDefinition;
	text.marks!.push({ type: "strong" });
	const pages = [createNode({ contents })];
	prepareAdfToUpload(pages, testSettings);
	const serialized = JSON.parse(JSON.stringify(pages[0]!.file.contents));
	expect(serialized.content[0].content[0]).toEqual({
		type: "text",
		text: "Missing",
		marks: [{ type: "strong" }],
	});
});

test.each([
	{ type: "hardBreak" },
	{ type: "mention", attrs: { id: "account", text: "@User" } },
	{ type: "emoji", attrs: { shortName: ":smile:", text: "🙂" } },
	{ type: "date", attrs: { timestamp: "1690000000000" } },
	{ type: "inlineCard", attrs: { url: "https://example.com" } },
])("merges only adjacent text around $type nodes", (barrier) => {
	const node = createNode({
		contents: {
			version: 1,
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "a" },
						{ type: "text", text: "b" },
						barrier,
						{ type: "text", text: "c" },
						{ type: "text", text: "d" },
					],
				},
			],
		} as JSONDocNode,
	});
	prepareAdfToUpload([node], testSettings);
	expect(node.file.contents.content[0]!.content).toEqual([
		{ type: "text", text: "ab" },
		barrier,
		{ type: "text", text: "cd" },
	]);
});

test("preserves mentions after resolving an unpublished wikilink", () => {
	const node = createNode({
		contents: parseMarkdownToADF(
			"alpha [[missing|beta]] [[mention:account|@User]] gamma",
			testSettings.confluenceBaseUrl,
		),
	});
	prepareAdfToUpload([node], testSettings);
	expect(node.file.contents.content[0]!.content).toEqual([
		{ type: "text", text: "alpha beta " },
		{ type: "mention", attrs: { id: "account", text: "@User" } },
		{ type: "text", text: " gamma" },
	]);
});

test("keeps differently marked text separate while merging identical marks", () => {
	const node = createNode({
		contents: {
			version: 1,
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "a", marks: [{ type: "strong" }] },
						{ type: "text", text: "b", marks: [{ type: "strong" }] },
						{ type: "text", text: "c", marks: [{ type: "em" }] },
						{ type: "text", text: "d" },
					],
				},
			],
		} as JSONDocNode,
	});
	prepareAdfToUpload([node], testSettings);
	expect(node.file.contents.content[0]!.content).toEqual([
		{ type: "text", text: "ab", marks: [{ type: "strong" }] },
		{ type: "text", text: "c", marks: [{ type: "em" }] },
		{ type: "text", text: "d" },
	]);
});

test("retains every overlapping inline comment through repeated publication", () => {
	const marks = ["comment-one", "comment-two"].map((id) => ({
		type: "annotation",
		attrs: { annotationType: "inlineComment", id },
	}));
	const remote = {
		version: 1,
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{ type: "text", text: "Before " },
					{ type: "text", text: "Anchor", marks },
					{ type: "text", text: " after" },
				],
			},
		],
	} as JSONDocNode;
	const source = {
		version: 1,
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text: "Before Anchor after" }] }],
	} as JSONDocNode;
	const node = createNode({ contents: structuredClone(source) });
	node.existingPageData.adfContent = remote;
	for (let attempt = 0; attempt < 2; attempt++) {
		prepareAdfToUpload([node], testSettings);
		expect(node.file.contents).toEqual(remote);
		node.existingPageData.adfContent = structuredClone(node.file.contents);
		node.file.contents = structuredClone(source);
	}
});

test("does not duplicate annotations already present in losslessly imported source", () => {
	const document = {
		version: 1,
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: "Anchor",
						marks: ["one", "two"].map((id) => ({
							type: "annotation",
							attrs: { annotationType: "inlineComment", id },
						})),
					},
				],
			},
		],
	} as JSONDocNode;
	const node = createNode({ contents: structuredClone(document) });
	node.existingPageData.adfContent = structuredClone(document);
	prepareAdfToUpload([node], testSettings);
	expect(node.file.contents).toEqual(document);
});
