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

const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;

export class MdToADF {
	private transformer: MarkdownTransformer;
	private serializer: JSONTransformer;
	constructor() {
		this.transformer = new MarkdownTransformer();
		this.serializer = new JSONTransformer();
	}

	private parse(markdown: string) {
		const prosenodes = this.transformer.parse(markdown);
		const adfNodes = this.serializer.encode(prosenodes);
		const nodes = this.processADF(adfNodes);
		return nodes;
	}

	private processADF(adf: JSONDocNode): JSONDocNode {
		const olivia = traverse(adf, {
			text: (node, _parent) => {
				if (
					node.marks &&
					node.marks[0].type === "link" &&
					node.marks[0].attrs
				) {
					if (node.marks[0].attrs.href === node.text) {
						node.type = "inlineCard";
						node.attrs = { url: node.marks[0].attrs.href };
						delete node.marks;
						delete node.text;
						return node;
					}
				}
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
				if (node.attrs && Object.keys(node.attrs).length === 0) {
					delete node.attrs;
				}

				if ((node.attrs || {})?.language === "adf") {
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

	convertMDtoADF(file: MarkdownFile): LocalAdfFile {
		file.contents = file.contents.replace(frontmatterRegex, "");

		const results = processConniePerPageConfig(file);

		const adrobj = this.parse(file.contents);

		return {
			...file,
			...results,
			contents: adrobj,
		};
	}
}
