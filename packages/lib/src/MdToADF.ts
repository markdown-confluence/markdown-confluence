import { JSONDocNode, JSONTransformer } from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { MarkdownFile } from "./MarkdownWorkspace";
import { LocalAdfFile } from "./Publisher";
import { processConniePerPageConfig } from "./ConniePageConfig";
import { p } from "@atlaskit/adf-utils/builders";
import { MarkdownToConfluenceCodeBlockLanguageMap } from "./CodeBlockLanguageMap";
import { isSafeUrl } from "@atlaskit/adf-schema";
import { ConfluenceSettings } from "./Settings";
import { cleanUpUrlIfConfluence } from "./ConfluenceUrlParser";

const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---\s*/g;

const transformer = new MarkdownTransformer();
const serializer = new JSONTransformer();

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
	const prosenodes = transformer.parse(stripMarkdownHtmlComments(markdown));
	const adfNodes = serializer.encode(prosenodes);
	const nodes = processADF(adfNodes, confluenceBaseUrl);
	return nodes;
}

function processADF(adf: JSONDocNode, confluenceBaseUrl: string): JSONDocNode {
	const headingFragments = collectHeadingFragments(adf);
	const olivia = traverse(adf, {
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

	const adfContent = parseMarkdownToADF(file.contents, settings.confluenceBaseUrl);

	const results = processConniePerPageConfig(file, settings, adfContent);

	return {
		...file,
		...results,
		contents: adfContent,
	};
}
