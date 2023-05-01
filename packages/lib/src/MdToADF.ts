import {
	JSONDocNode,
	JSONTransformer,
} from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { MarkdownFile } from "./adaptors";
import { LocalAdfFile } from "./Publisher";
import { processConniePerPageConfig } from "./ConniePageConfig";
import { p } from "@atlaskit/adf-utils/builders";
import { MarkdownToConfluenceCodeBlockLanguageMap } from "./CodeBlockLanguageMap";
import { isSafeUrl } from "@atlaskit/adf-schema";
import { ConfluenceSettings } from "./Settings";

const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---\s*/g;

const transformer = new MarkdownTransformer();
const serializer = new JSONTransformer();

export function parseMarkdownToADF(markdown: string) {
	const prosenodes = transformer.parse(markdown);
	const adfNodes = serializer.encode(prosenodes);
	const nodes = processADF(adfNodes);
	return nodes;
}

function processADF(adf: JSONDocNode): JSONDocNode {
	const olivia = traverse(adf, {
		text: (node, _parent) => {
			if (
				!(
					node.marks &&
					node.marks[0].type === "link" &&
					node.marks[0].attrs &&
					"href" in node.marks[0].attrs
				)
			) {
				return;
			}

			if (
				node.marks[0].attrs.href === "" ||
				(!isSafeUrl(node.marks[0].attrs.href) &&
					!(node.marks[0].attrs.href as string).startsWith(
						"wikilink"
					))
			) {
				node.marks[0].attrs.href = "#";
			}

			if (node.marks[0].attrs.href === node.text) {
				node.type = "inlineCard";
				node.attrs = { url: node.marks[0].attrs.href };
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
				return;
			}

			if (Object.keys(node.attrs).length === 0) {
				delete node.attrs;
				return node;
			}

			const codeBlockLanguage = (node.attrs || {})?.language;

			if (codeBlockLanguage in MarkdownToConfluenceCodeBlockLanguageMap) {
				node.attrs.language =
					MarkdownToConfluenceCodeBlockLanguageMap[codeBlockLanguage];
			}

			if (codeBlockLanguage === "adf") {
				if (!node?.content?.at(0)?.text) {
					return node;
				}
				try {
					const parsedAdf = JSON.parse(
						node?.content?.at(0)?.text ??
							JSON.stringify(
								p("ADF missing from ADF Code Block.")
							)
					);
					node = parsedAdf;
					return node;
				} catch (e) {
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

export function convertMDtoADF(
	file: MarkdownFile,
	settings: ConfluenceSettings
): LocalAdfFile {
	file.contents = file.contents.replace(frontmatterRegex, "");

	const adfContent = parseMarkdownToADF(file.contents);

	const results = processConniePerPageConfig(file, settings, adfContent);

	return {
		...file,
		...results,
		contents: adfContent,
	};
}
