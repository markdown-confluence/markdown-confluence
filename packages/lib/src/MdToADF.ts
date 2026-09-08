import { structuredMarkdown, jiraShorthand } from "./StructuredMarkdown";
import { JSONDocNode, JSONTransformer } from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { MarkdownFile } from "./MarkdownWorkspace";
import { LocalAdfFile } from "./Publisher";
import { processConniePerPageConfig } from "./ConniePageConfig";
import { restoreAdfCodeBlocks } from "./AdfDocument";
import { MarkdownToConfluenceCodeBlockLanguageMap } from "./CodeBlockLanguageMap";
import { isSafeUrl } from "@atlaskit/adf-schema";
import { ConfluenceSettings, resolveSiteUrl } from "./Settings";
import { cleanUpUrlIfConfluence } from "./ConfluenceUrlParser";
import SparkMD5 from "spark-md5";
import MarkdownIt from "markdown-it";
import { markdownItTable } from "markdown-it-table";

const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---\s*/g;

const transformer = new MarkdownTransformer();
const serializer = new JSONTransformer();

type AdfNode = {
	type: string;
	attrs?: Record<string, unknown>;
	content?: AdfNode[];
	text?: string;
	marks?: unknown[];
	[key: string]: unknown;
};

type TaskListCounters = {
	taskItem: number;
	taskList: number;
};
type PageFragment = "header" | "body" | "footer";

// Use the same CommonMark block grammar as MarkdownTransformer, enabling only
// HTML comments. Other HTML remains ordinary Markdown in the converter.
const commentParser = new MarkdownIt("commonmark", { html: true });
commentParser.use(markdownItTable);
const htmlBlockParser = new MarkdownIt("commonmark", { html: true });
htmlBlockParser.block.ruler.enableOnly("html_block");
const htmlBlockRule = htmlBlockParser.block.ruler.getRules("")[0]!;
commentParser.block.ruler.at(
	"html_block",
	(state, startLine, endLine, silent) =>
		state.src.startsWith("<!--", state.bMarks[startLine]! + state.tShift[startLine]!) &&
		htmlBlockRule(state, startLine, endLine, silent),
	// HTML must not interrupt paragraphs: the converter allows multiline code
	// spans containing a line that starts with a comment delimiter.
	{ alt: ["reference", "blockquote"] },
);

export function stripMarkdownHtmlComments(markdown: string): string {
	if (!markdown.includes("<!--")) return markdown;

	const ranges = commentCodeRanges(markdown);
	const markers = [...markdown.matchAll(/`+|<!--/g)];
	const nextBackticks = new Map<number, number>();
	const closingBackticks = new Map<number, number>();
	for (let index = markers.length - 1; index >= 0; index--) {
		const marker = markers[index]![0];
		if (marker === "<!--") continue;
		// A backslash escapes only the first backtick in a run when opening a
		// span. Within code, the complete raw run still acts as a closer.
		const openingLength =
			marker.length - Number(isMarkdownCharacterEscaped(markdown, markers[index]!.index));
		const closing = nextBackticks.get(openingLength);
		if (closing !== undefined) closingBackticks.set(index, closing);
		nextBackticks.set(marker.length, index);
	}

	const output: string[] = [];
	let retainedFrom = 0;
	let rangeIndex = 0;
	for (let index = 0; index < markers.length; index++) {
		const marker = markers[index]!;
		const start = marker.index;
		if (start < retainedFrom) continue;
		while (ranges[rangeIndex] && ranges[rangeIndex]!.end <= start) rangeIndex++;
		const range = ranges[rangeIndex];
		const inRange = range && range.start <= start;
		if (inRange && range.type !== "inline") continue;
		if (
			isMarkdownCharacterEscaped(markdown, start) &&
			(marker[0] === "<!--" || marker[0].length === 1)
		)
			continue;

		if (marker[0] === "<!--") {
			const closing = markdown.indexOf("-->", start + 4);
			const end = closing === -1 ? markdown.length : closing + 3;
			output.push(markdown.slice(retainedFrom, start));
			// Retain line boundaries so removing a comment cannot join separate blocks.
			output.push(markdown.slice(start, end).replace(/[^\r\n]/g, ""));
			retainedFrom = end;
		} else {
			const closing = closingBackticks.get(index);
			if (inRange && closing !== undefined && markers[closing]!.index < range.end)
				index = closing;
		}
	}
	output.push(markdown.slice(retainedFrom));
	return output.join("");
}

function commentCodeRanges(markdown: string) {
	// MarkdownIt treats CR, CRLF, and LF as line endings. Keep offsets into the
	// original source so stripping comments preserves the user's line endings.
	const offsets = [0];
	for (const newline of markdown.matchAll(/\r\n|\r|\n/g))
		offsets.push(newline.index + newline[0].length);
	offsets.push(markdown.length);
	const ranges: { start: number; end: number; type: string }[] = [];
	const cellEnds = new Map<number, number>();
	let tableDepth = 0;
	for (const token of commentParser.parse(markdown, {})) {
		if (token.type === "table_open") tableDepth++;
		if (token.type === "table_close") tableDepth--;
		if (!token.map) continue;
		let start = offsets[token.map[0]]!;
		let end = offsets[token.map[1]]!;
		if (tableDepth > 0 && token.map[1] === token.map[0] + 1 && token.content) {
			// Table tokens share line maps, but each cell is parsed independently.
			// Locate their source content in order, including HTML cells that do not
			// produce code ranges, so repeated text cannot point into an earlier cell.
			const content = token.content.replace(/\n$/, "");
			const cellStart = cellEnds.get(token.map[0]) ?? start;
			const contentOffset = markdown.slice(cellStart, end).indexOf(content);
			if (contentOffset < 0) continue;
			start = cellStart + contentOffset;
			end = start + content.length;
			cellEnds.set(token.map[0], end);
		} else if (tableDepth > 0) {
			continue;
		}
		if (["inline", "fence", "code_block"].includes(token.type))
			ranges.push({ start, end, type: token.type });
	}
	return ranges;
}

function isMarkdownCharacterEscaped(markdown: string, position: number): boolean {
	let backslashes = 0;
	while (position > 0 && markdown[--position] === "\\") backslashes++;
	return backslashes % 2 === 1;
}

export function parseMarkdownToADF(markdown: string, confluenceBaseUrl: string) {
	return parsePageFragmentToADF(markdown, confluenceBaseUrl, "body");
}

function parsePageFragmentToADF(
	markdown: string,
	confluenceBaseUrl: string,
	pageFragment: PageFragment,
	namespace: string = pageFragment,
): JSONDocNode {
	const prosenodes = transformer.parse(stripMarkdownHtmlComments(markdown), namespace);
	const adfNodes = serializer.encode(prosenodes);
	let nodes = processADF(adfNodes, confluenceBaseUrl);
	if (pageFragment !== "body") {
		nodes = traverse(nodes, {
			taskItem: (node) => ({
				...node,
				attrs: { ...node.attrs, localId: `${pageFragment}-${node.attrs?.["localId"]}` },
			}),
			taskList: (node) => ({
				...node,
				attrs: { ...node.attrs, localId: `${pageFragment}-${node.attrs?.["localId"]}` },
			}),
		}) as JSONDocNode;
	}
	return restoreAdfCodeBlocks(
		structuredMarkdown(
			replaceSupportedMacroPlaceholders(nodes, pageFragment),
			(source, childNamespace) =>
				parsePageFragmentToADF(source, confluenceBaseUrl, pageFragment, childNamespace),
			namespace,
		) as JSONDocNode,
	);
}

function processADF(adf: JSONDocNode, confluenceBaseUrl: string): JSONDocNode {
	const headingFragments = collectHeadingFragments(adf);
	const adfWithTaskLists = transformMarkdownTaskLists(adf as AdfNode) as JSONDocNode;
	const olivia = traverse(adfWithTaskLists, {
		text: (node, _parent) => {
			if (_parent.parent?.node?.type == "listItem" && node.text) {
				node.text = node.text
					.replaceAll(/^\[[xX]\]/g, "✅")
					.replaceAll(/^\[[ ]\]/g, "🔲")
					.replaceAll(/^\[[*]\]/g, "⭐️");
			}

			if (
				!(
					node.marks &&
					node.marks[0] &&
					node.marks[0].type === "link" &&
					node.marks[0].attrs &&
					"href" in node.marks[0].attrs
				)
			) {
				return node;
			}

			const href = node.marks[0].attrs["href"];
			if (typeof href !== "string") {
				return node;
			}

			const markdownWikilinkHref = markdownLinkToWikilinkHref(href, headingFragments);
			if (markdownWikilinkHref) {
				node.marks[0].attrs["href"] = markdownWikilinkHref;
			} else if (href.startsWith("wikilinks:#")) {
				node.marks[0].attrs["href"] =
					`wikilinks:${normalizeHashFragment(href.slice("wikilinks:".length), headingFragments)}`;
			} else if (
				href === "" ||
				(!isSafeUrl(href) && !href.startsWith("wikilinks:") && !href.startsWith("mention:"))
			) {
				node.marks[0].attrs["href"] = "#";
			}

			if (node.marks[0].attrs["href"] === node.text) {
				const cleanedUrl = cleanUpUrlIfConfluence(
					node.marks[0].attrs["href"],
					confluenceBaseUrl,
				);
				node.type = "inlineCard";
				node.attrs = { url: cleanedUrl };
				delete node.marks;
				delete node.text;
			}

			return node;
		},
		table: (node, _parent) => {
			if (
				node.attrs &&
				"isNumberColumnEnabled" in node.attrs &&
				node.attrs["isNumberColumnEnabled"] === false
			) {
				delete node.attrs["isNumberColumnEnabled"];
			}
			return node;
		},
		tableRow: (node, _parent) => {
			return node;
		},
		tableHeader: (node, _parent) => {
			node.attrs = { colspan: 1, rowspan: 1, colwidth: [340], ...node.attrs };
			return node;
		},
		tableCell: (node, _parent) => {
			node.attrs = { colspan: 1, rowspan: 1, colwidth: [340], ...node.attrs };
			return node;
		},
		orderedList: (node, _parent) => {
			node.attrs = { ...node.attrs, order: node.attrs?.["order"] ?? 1 };
			return node;
		},
		codeBlock: (node, _parent) => {
			if (!node || !node.attrs) {
				return node;
			}

			if (Object.keys(node.attrs).length === 0) {
				delete node.attrs;
				return node;
			}

			const codeBlockLanguage = (node.attrs || {})?.["language"];

			if (codeBlockLanguage in MarkdownToConfluenceCodeBlockLanguageMap) {
				node.attrs["language"] =
					MarkdownToConfluenceCodeBlockLanguageMap[codeBlockLanguage];
			}

			return node;
		},
	});

	if (!olivia) {
		throw new Error("Failed to traverse");
	}

	return olivia as JSONDocNode;
}

function transformMarkdownTaskLists(
	node: AdfNode,
	counters: TaskListCounters = { taskItem: 1, taskList: 1 },
): AdfNode {
	const content = node.content;
	if (!content) {
		return node;
	}

	const transformedContent = content.flatMap((child) => {
		const transformedChild = transformMarkdownTaskLists(child, counters);
		if (transformedChild.type === "bulletList") {
			return splitBulletListTaskItems(transformedChild, counters);
		}
		return [transformedChild];
	});

	return {
		...node,
		content: transformedContent,
	};
}

function splitBulletListTaskItems(bulletList: AdfNode, counters: TaskListCounters): AdfNode[] {
	const result: AdfNode[] = [];
	let bulletItems: AdfNode[] = [];
	let taskItems: AdfNode[] = [];

	const flushBulletItems = () => {
		if (bulletItems.length === 0) {
			return;
		}
		result.push({
			...bulletList,
			content: bulletItems,
		});
		bulletItems = [];
	};

	const flushTaskItems = () => {
		if (taskItems.length === 0) {
			return;
		}
		result.push({
			type: "taskList",
			attrs: {
				localId: `task-list-${counters.taskList}`,
			},
			content: taskItems,
		});
		counters.taskList += 1;
		taskItems = [];
	};

	for (const listItem of bulletList.content ?? []) {
		const taskItem = convertListItemToTaskItem(listItem, counters);
		if (taskItem) {
			flushBulletItems();
			taskItems.push(taskItem);
			continue;
		}

		flushTaskItems();
		bulletItems.push(listItem);
	}

	flushTaskItems();
	flushBulletItems();

	return result;
}

function convertListItemToTaskItem(
	listItem: AdfNode,
	counters: TaskListCounters,
): AdfNode | undefined {
	if (listItem.type !== "listItem" || listItem.content?.length !== 1) {
		return undefined;
	}

	const paragraph = listItem.content[0];
	if (!paragraph || paragraph.type !== "paragraph") {
		return undefined;
	}

	const paragraphContent = paragraph.content ?? [];
	const firstChild = paragraphContent[0];
	if (!firstChild || firstChild.type !== "text" || typeof firstChild.text !== "string") {
		return undefined;
	}

	const taskMarker = parseTaskMarker(firstChild.text);
	if (!taskMarker) {
		return undefined;
	}

	const firstTaskContent = taskMarker.text
		? [
				{
					...firstChild,
					text: taskMarker.text,
				},
			]
		: [];

	const taskItem = {
		type: "taskItem",
		attrs: {
			localId: `task-${counters.taskItem}`,
			state: taskMarker.state,
		},
		content: [...firstTaskContent, ...paragraphContent.slice(1)],
	};
	counters.taskItem += 1;

	return taskItem;
}

function parseTaskMarker(
	textContent: string,
): { state: "TODO" | "DONE"; text: string } | undefined {
	const markerMatch = textContent.match(/^\[( |x|X)\]\s?(.*)$/u);
	if (!markerMatch) {
		return undefined;
	}

	return {
		state: markerMatch[1] === " " ? "TODO" : "DONE",
		text: markerMatch[2] ?? "",
	};
}

function markdownLinkToWikilinkHref(
	href: string,
	headingFragments: Map<string, string>,
): string | undefined {
	if (href.startsWith("#")) {
		return `wikilinks:${normalizeHashFragment(href, headingFragments)}`;
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
		return undefined;
	}

	const hashIndex = href.indexOf("#");
	const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
	const rawHash = hashIndex === -1 ? "" : href.slice(hashIndex);
	const pathWithoutQuery = rawPath.split("?")[0] ?? "";

	if (!pathWithoutQuery) {
		return rawHash
			? `wikilinks:${normalizeHashFragment(rawHash, headingFragments)}`
			: undefined;
	}

	const markdownPath = markdownPathToWikilinkPath(pathWithoutQuery);
	if (!markdownPath) {
		return undefined;
	}

	return `wikilinks:${markdownPath}${normalizeHashFragment(rawHash, headingFragments)}`;
}

function markdownPathToWikilinkPath(path: string): string | undefined {
	const normalizedPath = normalizeMarkdownPath(path);

	if (normalizedPath.endsWith("/")) {
		return `${normalizedPath}README`;
	}

	if (/\.(md|markdown)$/i.test(normalizedPath)) {
		return normalizedPath.replace(/\.(md|markdown)$/i, "");
	}

	return undefined;
}

function normalizeMarkdownPath(path: string): string {
	const decodedPath = safeDecodeURI(path).replace(/\\/g, "/");
	const segments: string[] = [];

	for (const segment of decodedPath.split("/")) {
		if (segment === "" || segment === ".") {
			continue;
		}
		if (segment === "..") {
			if (segments.length > 0 && segments.at(-1) !== "..") {
				segments.pop();
			} else {
				segments.push(segment);
			}
			continue;
		}
		segments.push(segment);
	}

	return segments.join("/") + (decodedPath.endsWith("/") ? "/" : "");
}

function normalizeHashFragment(hash: string, headingFragments: Map<string, string>): string {
	if (!hash) {
		return "";
	}

	const hashText = safeDecodeURIComponent(hash.slice(1)).trim();
	const headingFragment = headingFragments.get(normalizeHeadingLookupKey(hashText));
	return headingFragment ?? `#${hashText.replace(/\s+/g, "-")}`;
}

function collectHeadingFragments(adf: JSONDocNode) {
	const headingFragments = new Map<string, string>();

	traverse(adf, {
		heading: (node) => {
			const headingText = collectText(node).trim();
			if (headingText) {
				headingFragments.set(
					normalizeHeadingLookupKey(headingText),
					`#${headingText.replace(/\s+/g, "-")}`,
				);
			}
			return node;
		},
	});

	return headingFragments;
}

function collectText(node: {
	text?: string;
	content?: Array<{ text?: string } | undefined>;
}): string {
	return (node.content ?? []).map((child) => child?.text ?? "").join("");
}

function normalizeHeadingLookupKey(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-");
}

function safeDecodeURI(value: string): string {
	try {
		return decodeURI(value);
	} catch {
		return value;
	}
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function convertMDtoADF(file: MarkdownFile, settings: ConfluenceSettings): LocalAdfFile {
	const rank = file.frontmatter["sort-order"];
	if (
		settings.orderPages &&
		rank !== undefined &&
		(typeof rank !== "number" || !Number.isFinite(rank))
	)
		throw new Error("sort-order must be a finite number");
	file.contents = file.contents.replace(frontmatterRegex, "");

	const adfContent = parseMarkdownToADF(file.contents, resolveSiteUrl(settings));

	if (settings.jiraUrl) jiraShorthand(adfContent, settings.jiraUrl);
	const results = processConniePerPageConfig(file, settings, adfContent);
	stripIgnoredCodeBlocks(adfContent as ADFNode, settings.ignoredCodeBlockLanguages ?? []);
	addConfiguredPageChrome(adfContent, settings);

	return {
		...file,
		...results,
		contents: adfContent,
	};
}

type ADFNode = {
	type: string;
	attrs?: Record<string, unknown>;
	content?: ADFNode[];
	text?: string;
	marks?: unknown[];
};

function replaceSupportedMacroPlaceholders(
	adf: JSONDocNode,
	pageFragment: PageFragment,
): JSONDocNode {
	if (!adf.content) {
		return adf;
	}

	let macroIndex = 0;
	adf.content = adf.content.map((node) => {
		if (isEmptyTocCodeBlock(node as ADFNode)) {
			const macroNode = createConfluenceMacroBlock(
				"toc",
				"Table of Contents",
				{},
				macroIndex,
				pageFragment,
			);
			macroIndex++;
			return macroNode;
		}

		const tocParameters = getStandaloneTocWikiMacroParameters(node as ADFNode);
		if (tocParameters) {
			const macroNode = createConfluenceMacroBlock(
				"toc",
				"Table of Contents",
				tocParameters,
				macroIndex,
				pageFragment,
			);
			macroIndex++;
			return macroNode;
		}

		return node;
	});

	return adf;
}

function isEmptyTocCodeBlock(node: ADFNode): boolean {
	return (
		node.type === "codeBlock" &&
		normalizeCodeBlockLanguage(node.attrs?.["language"]) === "toc" &&
		getCodeBlockText(node).trim() === ""
	);
}

function getStandaloneTocWikiMacroParameters(node: ADFNode): Record<string, string> | undefined {
	if (node.type !== "paragraph" || node.content?.length !== 1) {
		return undefined;
	}

	const [textNode] = node.content;
	if (textNode?.type !== "text" || typeof textNode.text !== "string" || textNode.marks?.length) {
		return undefined;
	}

	const match = textNode.text.trim().match(/^\{toc(?::(?<parameters>[^}]+))?}$/i);
	if (!match) {
		return undefined;
	}

	return parseWikiMacroParameters(match.groups?.["parameters"] ?? "");
}

function parseWikiMacroParameters(parameters: string): Record<string, string> {
	const parsed: Record<string, string> = {};

	for (const parameter of parameters.split("|")) {
		const trimmedParameter = parameter.trim();
		if (!trimmedParameter) {
			continue;
		}

		const equalsIndex = trimmedParameter.indexOf("=");
		if (equalsIndex === -1) {
			parsed[trimmedParameter] = "true";
			continue;
		}

		const key = trimmedParameter.slice(0, equalsIndex).trim();
		const value = trimmedParameter.slice(equalsIndex + 1).trim();
		if (key) {
			parsed[key] = value;
		}
	}

	return parsed;
}

function createConfluenceMacroBlock(
	extensionKey: string,
	title: string,
	parameters: Record<string, string>,
	index: number,
	pageFragment: PageFragment, // required to generate unique macro IDs
): ADFNode {
	const seed = `${pageFragment}:${extensionKey}:${JSON.stringify(parameters)}:${index}`;
	const macroId = SparkMD5.hash(seed);

	return {
		type: "extension",
		attrs: {
			extensionType: "com.atlassian.confluence.macro.core",
			extensionKey,
			parameters: {
				macroParams: Object.fromEntries(
					Object.entries(parameters).map(([key, value]) => [key, { value }]),
				),
				macroMetadata: {
					macroId: { value: macroId },
					schemaVersion: { value: "1" },
					title,
				},
			},
			localId: formatHashAsUuid(SparkMD5.hash(`local:${seed}`)),
		},
	};
}

function formatHashAsUuid(hash: string): string {
	return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function stripIgnoredCodeBlocks(
	node: ADFNode,
	ignoredCodeBlockLanguages: readonly string[],
): ADFNode {
	const ignoredLanguages = new Set(
		ignoredCodeBlockLanguages.map(normalizeCodeBlockLanguage).filter(Boolean),
	);

	if (ignoredLanguages.size === 0 || !node.content) {
		return node;
	}

	node.content = node.content.flatMap((child) => {
		if (
			child.type === "codeBlock" &&
			ignoredLanguages.has(normalizeCodeBlockLanguage(child.attrs?.["language"]))
		) {
			return [];
		}

		return [stripIgnoredCodeBlocks(child, ignoredCodeBlockLanguages)];
	});

	return node;
}

function addConfiguredPageChrome(adfContent: JSONDocNode, settings: ConfluenceSettings): void {
	const headerContent = parseConfiguredPageChromeMarkdown(
		settings.pageHeaderMarkdown,
		resolveSiteUrl(settings),
		"header",
	);
	const footerContent = parseConfiguredPageChromeMarkdown(
		settings.pageFooterMarkdown,
		resolveSiteUrl(settings),
		"footer",
	);

	if (headerContent.length === 0 && footerContent.length === 0) {
		return;
	}

	adfContent.content = [...headerContent, ...(adfContent.content ?? []), ...footerContent];
}

function parseConfiguredPageChromeMarkdown(
	markdown: string | undefined,
	confluenceBaseUrl: string,
	pageFragment: PageFragment,
): ADFNode[] {
	if (!markdown?.trim()) {
		return [];
	}

	return (parsePageFragmentToADF(markdown, confluenceBaseUrl, pageFragment).content ??
		[]) as ADFNode[];
}

function getCodeBlockText(node: ADFNode): string {
	return node.content?.map((child) => child.text ?? "").join("") ?? "";
}

function normalizeCodeBlockLanguage(language: unknown): string {
	return typeof language === "string" ? language.trim().toLowerCase() : "";
}
