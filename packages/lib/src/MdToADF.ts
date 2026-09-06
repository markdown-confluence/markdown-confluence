import { JSONDocNode, JSONTransformer } from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { MarkdownFile } from "./MarkdownWorkspace";
import { LocalAdfFile } from "./Publisher";
import { processConniePerPageConfig } from "./ConniePageConfig";
import { p } from "@atlaskit/adf-utils/builders";
import { MarkdownToConfluenceCodeBlockLanguageMap } from "./CodeBlockLanguageMap";
import { isSafeUrl } from "@atlaskit/adf-schema";
import { ConfluenceSettings, resolveSiteUrl } from "./Settings";
import { cleanUpUrlIfConfluence } from "./ConfluenceUrlParser";
import SparkMD5 from "spark-md5";

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

export function stripMarkdownHtmlComments(markdown: string): string {
	const lines = markdown.split("\n");
	const strippedLines: string[] = [];
	let inComment = false;
	let fenceMarker: string | undefined;

	for (const line of lines) {
		const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
		if (fenceMarker) {
			strippedLines.push(line);
			if (
				fenceMatch &&
				fenceMatch[1]?.startsWith(fenceMarker.charAt(0)) &&
				fenceMatch[1].length >= fenceMarker.length
			) {
				fenceMarker = undefined;
			}
			continue;
		}

		if (fenceMatch) {
			fenceMarker = fenceMatch[1];
			strippedLines.push(line);
			continue;
		}

		if (/^( {4,}|\t)/.test(line)) {
			strippedLines.push(line);
			continue;
		}

		let strippedLine = "";
		let position = 0;

		while (position < line.length) {
			if (inComment) {
				const commentEnd = line.indexOf("-->", position);
				if (commentEnd === -1) {
					position = line.length;
				} else {
					inComment = false;
					position = commentEnd + 3;
				}
				continue;
			}

			if (line.startsWith("<!--", position)) {
				inComment = true;
				position += 4;
				continue;
			}

			if (line[position] === "`") {
				const runEnd = position + countBacktickRun(line, position);
				const backtickRun = line.slice(position, runEnd);
				const closingRun = line.indexOf(backtickRun, runEnd);

				if (closingRun === -1) {
					strippedLine += backtickRun;
					position = runEnd;
				} else {
					strippedLine += line.slice(position, closingRun + backtickRun.length);
					position = closingRun + backtickRun.length;
				}
				continue;
			}

			strippedLine += line[position];
			position++;
		}

		strippedLines.push(strippedLine);
	}

	return strippedLines.join("\n");
}

function countBacktickRun(line: string, position: number): number {
	let count = 0;
	while (line[position + count] === "`") {
		count++;
	}
	return count;
}

export function parseMarkdownToADF(markdown: string, confluenceBaseUrl: string) {
	return parsePageFragmentToADF(markdown, confluenceBaseUrl, "body");
}

function parsePageFragmentToADF(
	markdown: string,
	confluenceBaseUrl: string,
	pageFragment: PageFragment,
) {
	const prosenodes = transformer.parse(stripMarkdownHtmlComments(markdown));
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
	return replaceSupportedMacroPlaceholders(nodes, pageFragment);
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
			node.attrs = { colspan: 1, rowspan: 1, colwidth: [340] };
			return node;
		},
		tableCell: (node, _parent) => {
			node.attrs = { colspan: 1, rowspan: 1, colwidth: [340] };
			return node;
		},
		orderedList: (node, _parent) => {
			node.attrs = { order: 1 };
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

			if (codeBlockLanguage === "adf") {
				if (!node?.content?.at(0)?.text) {
					return node;
				}
				try {
					const parsedAdf = JSON.parse(
						node?.content?.at(0)?.text ??
							JSON.stringify(p("ADF missing from ADF Code Block.")),
					);
					node = parsedAdf;
					return node;
				} catch {
					return node;
				}
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
	file.contents = file.contents.replace(frontmatterRegex, "");

	const adfContent = parseMarkdownToADF(file.contents, resolveSiteUrl(settings));

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
			const macroNode = createConfluenceMacroParagraph(
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
			const macroNode = createConfluenceMacroParagraph(
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

function createConfluenceMacroParagraph(
	extensionKey: string,
	title: string,
	parameters: Record<string, string>,
	index: number,
	pageFragment: PageFragment, // required to generate unique macro IDs
): ADFNode {
	const seed = `${pageFragment}:${extensionKey}:${JSON.stringify(parameters)}:${index}`;
	const macroId = SparkMD5.hash(seed);

	return {
		type: "paragraph",
		content: [
			{
				type: "inlineExtension",
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
			},
		],
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
