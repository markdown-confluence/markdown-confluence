/* eslint-disable @typescript-eslint/naming-convention */
import { expect, test } from "@effect/vitest";
import { MarkdownFile } from "./MarkdownWorkspace";
import { convertMDtoADF } from "./MdToADF";
import { ConfluenceSettings } from "./Settings";

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
	{
		folderName: "images",
		absoluteFilePath: "/path/to/images.md",
		fileName: "images.md",
		contents:
			'![Alt text](/path/to/image.jpg)\n\n![Alt text with title](/path/to/image.jpg "Image Title")',
		pageTitle: "Images",
		frontmatter: {
			title: "Images",
			description: "A Markdown file demonstrating different image styles.",
		},
	},
	{
		folderName: "reference_images",
		absoluteFilePath: "/path/to/reference_images.md",
		fileName: "reference_images.md",
		contents:
			"![Alt text][image-ref]\n\n![Collapsed reference][]\n\n[image-ref]: ../images/the-image.png\n[Collapsed reference]: ../images/collapsed.png",
		pageTitle: "Reference Images",
		frontmatter: {
			title: "Reference Images",
			description: "A Markdown file demonstrating reference-style image links.",
		},
	},
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
	{
		folderName: "inline_html",
		absoluteFilePath: "/path/to/inline_html.md",
		fileName: "inline_html.md",
		contents: "<p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>",
		pageTitle: "Inline HTML",
		frontmatter: {
			title: "Inline HTML",
			description: "A Markdown file demonstrating the use of inline HTML.",
		},
	},
	{
		folderName: "html_comments",
		absoluteFilePath: "/path/to/html_comments.md",
		fileName: "html_comments.md",
		contents: [
			"Before",
			"",
			"<!-- hidden block comment -->",
			"",
			"Middle <!-- hidden inline comment --> text",
			"",
			"<!-- multi-line",
			"hidden comment -->",
			"After",
			"",
			"`<!-- visible inline code comment -->`",
			"",
			"```html",
			"<!-- visible fenced code comment -->",
			"```",
		].join("\n"),
		pageTitle: "HTML Comments",
		frontmatter: {
			title: "HTML Comments",
			description: "A Markdown file demonstrating HTML comments are ignored.",
		},
	},
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
			"connie-page-id": "12345",
			"connie-dont-change-parent-page": true,
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
			"connie-page-id": 67890,
			"connie-dont-change-parent-page": false,
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
			"connie-page-id": "qwerty",
			"connie-dont-change-parent-page": "invalid",
		},
	},
	{
		folderName: "blog",
		absoluteFilePath: "/path/to/blog.md",
		fileName: "blog.md",
		contents:
			"# Header 1\n\n## Header 2\n\n### Header 3\n\n#### Header 4\n\n##### Header 5\n\n###### Header 6",
		pageTitle: "Blog",
		frontmatter: {
			"connie-blog-post-date": "2022-01-01",
		},
	},
	{
		folderName: "tasks",
		absoluteFilePath: "/path/to/tasks.md",
		fileName: "tasks.md",
		contents: `
- Regular list item
- [ ] Unchecked item
- [x] Checked item
- [*] Starred item
- No checkbox [x] in the middle

[x] non list item shouldn't get checkbox
			`.trim(),
		pageTitle: "Tasks",
		frontmatter: {
			"connie-blog-post-date": "2022-01-01",
		},
	},
];

const testSettings: ConfluenceSettings = {
	confluenceBaseUrl: "https://example.com",
	confluenceParentId: "asdf",
	atlassianUserName: "asdf@asdf.com",
	atlassianApiToken: "asdfasdf",
	folderToPublish: ".",
	contentRoot: "./",
	firstHeadingPageTitle: false,
};

test.each(markdownTestCases)("parses $fileName", (markdown: MarkdownFile) => {
	const adfFile = convertMDtoADF(markdown, testSettings);
	expect(adfFile).toMatchSnapshot();
});

test("converts markdown task list items to ADF task nodes", () => {
	const markdown: MarkdownFile = {
		folderName: "tasks",
		absoluteFilePath: "/path/to/tasks.md",
		fileName: "tasks.md",
		contents: "- [ ] Draft the page\n- [x] Publish it",
		pageTitle: "Tasks",
		frontmatter: {},
	};
	const settings: ConfluenceSettings = {
		confluenceBaseUrl: "https://example.com",
		confluenceParentId: "asdf",
		atlassianUserName: "asdf@asdf.com",
		atlassianApiToken: "asdfasdf",
		folderToPublish: ".",
		contentRoot: "./",
		firstHeadingPageTitle: false,
	};

	const adfFile = convertMDtoADF(markdown, settings);

	expect(adfFile.contents.content?.[0]).toEqual({
		type: "taskList",
		attrs: {
			localId: "task-list-1",
		},
		content: [
			{
				type: "taskItem",
				attrs: {
					localId: "task-1",
					state: "TODO",
				},
				content: [
					{
						type: "text",
						text: "Draft the page",
					},
				],
			},
			{
				type: "taskItem",
				attrs: {
					localId: "task-2",
					state: "DONE",
				},
				content: [
					{
						type: "text",
						text: "Publish it",
					},
				],
			},
		],
	});
});

test("parses callout with adjacent wikilink image", () => {
	const markdown: MarkdownFile = {
		folderName: "callouts",
		absoluteFilePath: "/path/to/callouts.md",
		fileName: "callouts.md",
		contents: [
			"> [!info] Title",
			"> Request the following three groups, so three separate requests:",
			"> \t`group1`",
			"> \t`group2`",
			"> \t`group3`",
			"> ",
			"> [Request Ticket](https://somelink.internal/123)",
			"> ![[Pasted image 20231006155212.png|400]]",
		].join("\n"),
		pageTitle: "Callouts",
		frontmatter: {},
	};

	const adfFile = convertMDtoADF(markdown, testSettings);

	expect(adfFile.contents.content?.[0]?.type).toBe("panel");
	expect(JSON.stringify(adfFile.contents)).toContain("file://Pasted image 20231006155212.png");
});

test("parses multiple image paragraphs without dropping later images", () => {
	const adfFile = convertMDtoADF(
		createMarkdownFile(
			[
				"Intro",
				"![First image](first.png)",
				"",
				"Middle",
				"![Second image](second.png)",
				"",
				"Done",
			].join("\n"),
		),
		testSettings,
	);

	const contents = JSON.stringify(adfFile.contents);
	expect(contents).toContain("file://first.png");
	expect(contents).toContain("file://second.png");
	expect(contents).toContain("Done");
});

test("parses wikilink images adjacent to lists and headings", () => {
	const adfFile = convertMDtoADF(
		createMarkdownFile(
			[
				"- something",
				"![[list-image.png]]",
				"",
				"### Header3",
				"![[heading-image.png]]",
			].join("\n"),
		),
		testSettings,
	);

	const contents = JSON.stringify(adfFile.contents);
	expect(contents).toContain("file://list-image.png");
	expect(contents).toContain("file://heading-image.png");
});

test("converts markdown highlights to bold text", () => {
	const adfFile = convertMDtoADF(
		createMarkdownFile("This is ==highlighted== text"),
		testSettings,
	);
	const paragraph = adfFile.contents.content?.[0];
	const highlightedText = paragraph?.content?.find((node) => node.text === "highlighted");

	expect(highlightedText?.marks?.[0]?.type).toBe("strong");
});

test("normalizes local heading and relative markdown links", () => {
	const adfFile = convertMDtoADF(
		createMarkdownFile(
			[
				"[[#Overview |Overview of Feature]]",
				"[[#How to Use|How to Use Feature]]",
				"[Context](context/README.md#How%20to%20Use)",
				"",
				"# Overview",
				"## How to use",
			].join("\n"),
		),
		testSettings,
	);
	const links = JSON.stringify(adfFile.contents);

	expect(links).toContain("wikilinks:#Overview");
	expect(links).toContain("wikilinks:#How-to-use");
	expect(links).toContain("wikilinks:context/README#How-to-use");
	expect(links).not.toContain('"href":"#"');
});

test("keeps indented wikilink-like image text parseable", () => {
	const adfFile = convertMDtoADF(createMarkdownFile("\t[[!image.png]]"), testSettings);

	expect(adfFile.contents.content?.[0]?.type).toBe("codeBlock");
});

function createMarkdownFile(contents: string): MarkdownFile {
	return {
		folderName: "edge-cases",
		absoluteFilePath: "/path/to/edge-cases.md",
		fileName: "edge-cases.md",
		contents,
		pageTitle: "Edge Cases",
		frontmatter: {},
	};
}

test("parses wikilink images inside nested lists without dropping later images", () => {
	const markdown: MarkdownFile = {
		folderName: "lists",
		absoluteFilePath: "/path/to/lists.md",
		fileName: "lists.md",
		contents: [
			"## Main",
			"Word paragraph",
			"1. List 1",
			"2. List 2",
			"\t1. Sub list (images)",
			"\t   ",
			"\t\t![[Pasted image 20231010114953.png]]",
			"\t\t",
			"\t\t![[Pasted image 20231010115214.png]]",
		].join("\n"),
		pageTitle: "Nested List Images",
		frontmatter: {},
	};

	const adfFile = convertMDtoADF(markdown, testSettings);

	expect(collectMediaUrls(adfFile.contents)).toEqual([
		"file://Pasted image 20231010114953.png",
		"file://Pasted image 20231010115214.png",
	]);
});

test("parses image size hints from wikilink and markdown image syntax", () => {
	const markdown: MarkdownFile = {
		folderName: "images",
		absoluteFilePath: "/path/to/images.md",
		fileName: "images.md",
		contents: [
			"![[./img/chewbacca.png|111]]",
			"",
			"![chewy|222x333](./img/chewbacca.png)",
		].join("\n"),
		pageTitle: "Sized Images",
		frontmatter: {},
	};

	const adfFile = convertMDtoADF(markdown, testSettings);
	const mediaAttrs = collectMediaAttrs(adfFile.contents);

	expect(mediaAttrs[0]).toMatchObject({
		type: "file",
		url: "file://./img/chewbacca.png",
		width: 111,
	});
	expect(mediaAttrs[1]).toMatchObject({
		height: 333,
		type: "file",
		url: "file://./img/chewbacca.png",
		width: 222,
	});
});

test("parses non-image wikilink embeds as uploadable file media", () => {
	const markdown: MarkdownFile = {
		folderName: "attachments",
		absoluteFilePath: "/path/to/attachments.md",
		fileName: "attachments.md",
		contents: "![[profiles/render.cpuprofile]]",
		pageTitle: "Profile",
		frontmatter: {},
	};

	const adfFile = convertMDtoADF(markdown, testSettings);

	expect(collectMediaUrls(adfFile.contents)).toEqual(["file://profiles/render.cpuprofile"]);
});

function collectMediaUrls(node: unknown): string[] {
	return collectMediaAttrs(node)
		.map((attrs) => attrs["url"])
		.filter((url): url is string => typeof url === "string");
}

function collectMediaAttrs(node: unknown): Record<string, unknown>[] {
	if (!node || typeof node !== "object") {
		return [];
	}

	const record = node as Record<string, unknown>;
	const attrs =
		record["type"] === "media" && record["attrs"] && typeof record["attrs"] === "object"
			? [record["attrs"] as Record<string, unknown>]
			: [];
	const content = Array.isArray(record["content"]) ? record["content"] : [];

	return [...attrs, ...content.flatMap(collectMediaAttrs)];
}
