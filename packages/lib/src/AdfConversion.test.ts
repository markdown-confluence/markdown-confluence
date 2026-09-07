import { expect, test } from "@effect/vitest";
import { convertADFToMarkdown } from "./AdfConversion";
import { renderADFDoc } from "./ADFToMarkdown";
import { adfCodeFence, readAdfDocument, type AdfValue } from "./AdfDocument";
import { parseMarkdownToADF } from "./MdToADF";

const baseUrl = "https://example.atlassian.net";
const text = (value: string): AdfValue => ({ type: "text", text: value });
const paragraph = (...content: AdfValue[]): AdfValue => ({ type: "paragraph", content });
const document = (...content: AdfValue[]) => ({ type: "doc", version: 1, content });

const richNodes: AdfValue[] = [
	{ type: "blockCard", attrs: { url: "https://example.com/card", localId: "card" } },
	{ type: "embedCard", attrs: { url: "https://example.com/embed", layout: "wide" } },
	{
		type: "mediaSingle",
		attrs: { layout: "center", width: 65 },
		content: [
			{
				type: "media",
				attrs: {
					type: "file",
					id: "media-id",
					collection: "attachments",
					width: 640,
					height: 480,
				},
			},
			{ type: "caption", content: [text("The caption")] },
		],
	},
	{
		type: "mediaGroup",
		content: [
			{ type: "media", attrs: { type: "file", id: "pdf-id", collection: "attachments" } },
		],
	},
	paragraph({
		type: "mediaInline",
		attrs: { id: "inline-id", collection: "attachments", type: "file" },
	}),
	paragraph({
		type: "image",
		attrs: { src: "https://example.com/image.png", alt: "Image", width: 42 },
	}),
	paragraph(
		{ type: "date", attrs: { timestamp: "1788739200000" } },
		text(" "),
		{ type: "status", attrs: { text: "READY", color: "green", localId: "status" } },
		text(" "),
		{ type: "placeholder", attrs: { text: "Your name" } },
	),
	paragraph({ type: "emoji", attrs: { id: "1f92f", shortName: ":exploding_head:", text: "🤯" } }),
	{
		type: "decisionList",
		attrs: { localId: "decisions" },
		content: [
			{
				type: "decisionItem",
				attrs: { localId: "decision", state: "DECIDED" },
				content: [text("Ship it")],
			},
		],
	},
	{
		type: "layoutSection",
		content: [
			{ type: "layoutColumn", attrs: { width: 50 }, content: [paragraph(text("Left"))] },
			{ type: "layoutColumn", attrs: { width: 50 }, content: [paragraph(text("Right"))] },
		],
	},
	{
		type: "expand",
		attrs: { title: "Outer" },
		content: [
			{
				type: "nestedExpand",
				attrs: { title: "Inner" },
				content: [paragraph(text("Nested text"))],
			},
		],
	},
	{
		type: "taskList",
		attrs: { localId: "tasks" },
		content: [
			{
				type: "taskItem",
				attrs: { localId: "task", state: "DONE" },
				content: [text("Finished")],
			},
		],
	},
	{
		type: "table",
		attrs: { layout: "wide" },
		content: [
			{
				type: "tableRow",
				content: [
					{
						type: "tableHeader",
						attrs: {
							colspan: 2,
							rowspan: 1,
							colwidth: [120, 200],
							background: "#ffffff",
						},
						content: [paragraph(text("Merged"))],
					},
				],
			},
		],
	},
];

for (const [index, node] of richNodes.entries()) {
	test(`preserves rich ADF case ${index}: ${node.type} including IDs and attributes`, () => {
		const original = document(node);
		const markdown = convertADFToMarkdown(original, { baseUrl });
		expect(parseMarkdownToADF(markdown, baseUrl)).toEqual(original);
	});
}

for (const type of [
	"unknownBlock",
	"unsupportedBlock",
	"unsupportedInline",
	"confluenceUnsupportedBlock",
	"confluenceUnsupportedInline",
	"bodiedExtension",
	"confluenceJiraIssue",
	"extension",
	"inlineExtension",
]) {
	test(`preserves ${type} through the existing adf fence format`, () => {
		const original = document({
			type,
			attrs: {
				extensionKey: "custom",
				parameters: { originalValue: { nested: [1, "two"] } },
			},
			content: [paragraph(text("Extension content"))],
		});
		expect(parseMarkdownToADF(convertADFToMarkdown(original), baseUrl)).toEqual(original);
	});
}

for (const type of [
	"alignment",
	"annotation",
	"border",
	"breakout",
	"confluenceInlineComment",
	"dataConsumer",
	"fragment",
	"indentation",
	"textColor",
	"backgroundColor",
	"typeAheadQuery",
	"underline",
	"unsupportedMark",
	"unsupportedNodeAttribute",
]) {
	test(`retains ${type} mark payloads instead of dropping them`, () => {
		const original = document({
			...paragraph(text("Marked")),
			marks: [
				{
					type,
					attrs: {
						id: "comment-id",
						align: "center",
						level: 2,
						color: "#ff0000",
						originalValue: { retained: true },
					},
				},
			],
		});
		expect(parseMarkdownToADF(convertADFToMarkdown(original), baseUrl)).toEqual(original);
	});
}

test("uses readable Markdown for ordinary content and only fences the unsupported block", () => {
	const original = document(
		paragraph(text("Hello")),
		{ type: "extension", attrs: { extensionKey: "toc" } },
		paragraph(text("After")),
	);
	const markdown = convertADFToMarkdown(original);
	expect(markdown.startsWith("Hello\n\n```adf\n")).toBe(true);
	expect(markdown.endsWith("After")).toBe(true);
	expect(parseMarkdownToADF(markdown, baseUrl)).toEqual(original);
});

test("restores full documents and nested raw blocks without a nested doc or normalization", () => {
	const original = document({
		type: "orderedList",
		attrs: { order: 7 },
		content: [{ type: "listItem", content: [paragraph(text("Seven"))] }],
	});
	expect(parseMarkdownToADF(adfCodeFence(original), baseUrl)).toEqual(original);
	expect(
		parseMarkdownToADF(`> ${adfCodeFence(original).replace(/\n/g, "\n> ")}`, baseUrl)
			.content?.[0]?.content,
	).toEqual(original.content);
});

test("fences remain reversible with backticks, empty paragraphs and unknown document attributes", () => {
	const original = {
		...document(
			paragraph(),
			{
				type: "codeBlock",
				attrs: { language: "adf" },
				content: [text('{"type":"paragraph","content":[{"type":"text","text":"```"}]}')],
			},
			paragraph(),
		),
		attrs: { custom: "retained" },
	};
	expect(parseMarkdownToADF(convertADFToMarkdown(original), baseUrl)).toEqual(original);
});

test("invalid ADF examples stay code and invalid CLI documents fail clearly", () => {
	for (const value of [null, 42, [], { type: "paragraph", content: [null] }, { type: "text" }]) {
		expect(parseMarkdownToADF(adfCodeFence(value), baseUrl).content?.[0]?.type).toBe(
			"codeBlock",
		);
		expect(() => readAdfDocument(value)).toThrow();
	}
	expect(() => readAdfDocument({ type: "doc", version: 2, content: [] })).toThrow();
	expect(
		readAdfDocument({
			body: {
				atlas_doc_format: {
					value: JSON.stringify(document(paragraph(text("API response")))),
				},
			},
		}),
	).toEqual(document(paragraph(text("API response"))));
});

test("reads underline, subscript, superscript and nested color spans without enabling arbitrary HTML", () => {
	const adf = parseMarkdownToADF(
		'<u>Under</u> H<sub>2</sub>O x<sup>2</sup> <span style="color: #ff0000"><u>Red</u></span> `<u>Code</u>` <script>alert(1)</script>',
		baseUrl,
	);
	const content = adf.content?.[0]?.content;
	expect(content).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ text: "Under", marks: [{ type: "underline" }] }),
			expect.objectContaining({
				text: "2",
				marks: [{ type: "subsup", attrs: { type: "sub" } }],
			}),
			expect.objectContaining({
				text: "2",
				marks: [{ type: "subsup", attrs: { type: "sup" } }],
			}),
			expect.objectContaining({
				text: "Red",
				marks: expect.arrayContaining([
					{ type: "underline" },
					{ type: "textColor", attrs: { color: "#ff0000" } },
				]),
			}),
			expect.objectContaining({ text: "<u>Code</u>", marks: [{ type: "code" }] }),
		]),
	);
	expect(JSON.stringify(adf)).toContain("<script>alert(1)</script>");
});

test("preserves Markdown table column alignment and numbered list starting values", () => {
	const adf = parseMarkdownToADF(
		"| Left | Center | Right |\n| :--- | :---: | ---: |\n| A | B | C |\n\n7. Seven\n8. Eight",
		baseUrl,
	);
	const table = adf.content?.[0];
	expect(table?.content?.[0]?.content?.map((cell) => cell?.content?.[0]?.marks)).toEqual([
		[{ type: "alignment", attrs: { align: "start" } }],
		[{ type: "alignment", attrs: { align: "center" } }],
		[{ type: "alignment", attrs: { align: "end" } }],
	]);
	expect(adf.content?.[1]?.attrs).toEqual({ order: 7 });
	const markdown = renderADFDoc(adf);
	expect(markdown).toContain("7. Seven\n8. Eight");
	expect(markdown).toMatch(/\| :-+ \| :-+: \| -+: \|/);
});

test("readable export renders cards, media captions, status and dates", () => {
	const markdown = convertADFToMarkdown(
		document(
			{ type: "blockCard", attrs: { url: "https://example.com" } },
			{
				type: "mediaSingle",
				content: [
					{
						type: "media",
						attrs: { type: "external", url: "https://example.com/image.png" },
					},
					{ type: "caption", content: [text("Caption")] },
				],
			},
			paragraph({ type: "status", attrs: { text: "READY", color: "green" } }, text(" "), {
				type: "date",
				attrs: { timestamp: "0" },
			}),
		),
		{ lossless: false },
	);
	expect(markdown).toContain("[https://example.com](https://example.com)");
	expect(markdown).toContain("![](https://example.com/image.png)\n\nCaption");
	expect(markdown).toContain("**READY** 1970-01-01");
});

test("escapes literal Markdown and uses longer code delimiters when needed", () => {
	const adf = document(
		paragraph(text("**literal** [link] <tag>"), { ...text("a`b"), marks: [{ type: "code" }] }),
		{ type: "codeBlock", attrs: { language: "text" }, content: [text("```\n**raw**")] },
	);
	const markdown = renderADFDoc(readAdfDocument(adf));
	expect(markdown).toContain("\\*\\*literal\\*\\* \\[link\\] \\<tag\\>");
	expect(markdown).toContain("``a`b``");
	expect(markdown).toContain("````text\n```\n**raw**\n````");
});

test("parses the established emoji identifier syntax and background color markup", () => {
	const adf = parseMarkdownToADF(
		':1f92f|exploding_head: <span style="background-color: #ffeeaa">Highlighted</span>',
		baseUrl,
	);
	expect(adf.content?.[0]?.content).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				type: "emoji",
				attrs: expect.objectContaining({ id: "1f92f", shortName: ":exploding_head:" }),
			}),
			expect.objectContaining({
				text: "Highlighted",
				marks: [{ type: "backgroundColor", attrs: { color: "#ffeeaa" } }],
			}),
		]),
	);
});

test("lossless export retains Confluence link metadata even though publishing ignores it for equality", () => {
	const original = document(
		paragraph({
			type: "text",
			text: "Page",
			marks: [
				{
					type: "link",
					attrs: {
						href: "https://example.atlassian.net/wiki/spaces/D/pages/123/Title",
						__confluenceMetadata: {
							isRenamedTitle: true,
							linkType: "page",
							contentTitle: "Title",
							versionAtSave: "1",
						},
					},
				},
			],
		}),
	);
	expect(parseMarkdownToADF(convertADFToMarkdown(original, { baseUrl }), baseUrl)).toEqual(
		original,
	);
});
