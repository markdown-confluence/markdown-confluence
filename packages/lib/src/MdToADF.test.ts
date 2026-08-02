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
test.each(markdownTestCases)("parses $fileName", (markdown: MarkdownFile) => {
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
	expect(adfFile).toMatchSnapshot();
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

	expect(adfFile.contents.content?.[0]?.type).toBe("panel");
	expect(JSON.stringify(adfFile.contents)).toContain("file://Pasted image 20231006155212.png");
});

test("converts toc code fences and wiki markup to Confluence TOC macros", () => {
	const markdown: MarkdownFile = {
		folderName: "macros",
		absoluteFilePath: "/path/to/macros.md",
		fileName: "macros.md",
		contents: ["```toc", "```", "", "{toc:printable=true|maxLevel=3}", "", "# Body"].join("\n"),
		pageTitle: "Macros",
		frontmatter: {},
	};

	const adfFile = convertMDtoADF(markdown, createTestSettings());
	const [tocFenceMacro, wikiTocMacro] = adfFile.contents.content ?? [];

	expect(tocFenceMacro?.type).toBe("paragraph");
	expect(JSON.stringify(tocFenceMacro)).toContain('"extensionKey":"toc"');
	expect(JSON.stringify(tocFenceMacro)).toContain('"title":"Table of Contents"');
	expect(JSON.stringify(wikiTocMacro)).toContain('"printable":{"value":"true"}');
	expect(JSON.stringify(wikiTocMacro)).toContain('"maxLevel":{"value":"3"}');
});

test("assigns distinct IDs to identical macros parsed in separate page fragments", () => {
	type MacroAttributes = {
		localId?: string;
		parameters?: {
			macroMetadata?: {
				macroId?: { value?: string };
			};
		};
	};

	const markdown: MarkdownFile = {
		folderName: "macros",
		absoluteFilePath: "/path/to/duplicate-macro-ids.md",
		fileName: "duplicate-macro-ids.md",
		contents: ["```toc", "```"].join("\n"),
		pageTitle: "Duplicate macro IDs",
		frontmatter: {},
	};

	const adfFile = convertMDtoADF(
		markdown,
		createTestSettings({ pageHeaderMarkdown: ["```toc", "```"].join("\n") }),
	);
	const [headerMacro, bodyMacro] = adfFile.contents.content ?? [];
	const headerMacroAttributes = headerMacro?.content?.[0]?.attrs as MacroAttributes | undefined;
	const bodyMacroAttributes = bodyMacro?.content?.[0]?.attrs as MacroAttributes | undefined;

	expect(headerMacroAttributes?.localId).not.toBe(bodyMacroAttributes?.localId);
	expect(headerMacroAttributes?.parameters?.macroMetadata?.macroId?.value).not.toBe(
		bodyMacroAttributes?.parameters?.macroMetadata?.macroId?.value,
	);
});

test("adds configured page header and footer while ignoring configured code blocks", () => {
	const markdown: MarkdownFile = {
		folderName: "transforms",
		absoluteFilePath: "/path/to/transforms.md",
		fileName: "transforms.md",
		contents: [
			"# Body",
			"",
			"```dataview",
			"LIST FROM #project",
			"```",
			"",
			"```button",
			"name Publish",
			"```",
			"",
			"```ts",
			"const keep = true;",
			"```",
		].join("\n"),
		pageTitle: "Transforms",
		frontmatter: {},
	};

	const adfFile = convertMDtoADF(
		markdown,
		createTestSettings({
			pageHeaderMarkdown: "Generated from source",
			pageFooterMarkdown: "_End of synced content_",
			ignoredCodeBlockLanguages: ["dataview", "button"],
		}),
	);
	const serializedAdf = JSON.stringify(adfFile.contents);

	expect(serializedAdf).toContain("Generated from source");
	expect(serializedAdf).toContain("End of synced content");
	expect(serializedAdf).not.toContain("LIST FROM #project");
	expect(serializedAdf).not.toContain("name Publish");
	expect(serializedAdf).toContain("const keep = true;");
	expect(adfFile.contents.content?.[0]?.content?.[0]?.text).toBe("Generated from source");
});

function createTestSettings(overrides: Partial<ConfluenceSettings> = {}): ConfluenceSettings {
	return {
		confluenceBaseUrl: "https://example.com",
		confluenceParentId: "asdf",
		atlassianUserName: "asdf@asdf.com",
		atlassianApiToken: "asdfasdf",
		folderToPublish: ".",
		contentRoot: "./",
		firstHeadingPageTitle: false,
		...overrides,
	};
}
