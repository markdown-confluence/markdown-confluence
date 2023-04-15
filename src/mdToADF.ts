import {
	JSONDocNode,
	JSONTransformer,
} from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { MarkdownFile } from "./adaptors/types";
import { LocalAdfFile } from "./Publisher";

const frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;

export default class MdToADF {
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
		});

		if (!olivia) {
			throw new Error("Failed to traverse");
		}

		return olivia as JSONDocNode;
	}

	convertMDtoADF(file: MarkdownFile): LocalAdfFile {
		let markdown = file.contents.replace(frontmatterRegex, "");

		file.pageTitle =
			file.frontmatter["connie-title"] &&
			typeof file.frontmatter["connie-title"] === "string"
				? file.frontmatter["connie-title"]
				: file.pageTitle;

		if (
			file.frontmatter["connie-frontmatter-to-publish"] &&
			Array.isArray(file.frontmatter["connie-frontmatter-to-publish"])
		) {
			let frontmatterHeader = "| Key | Value | \n | ----- | ----- |\n";
			for (const key of file.frontmatter[
				"connie-frontmatter-to-publish"
			]) {
				if (file.frontmatter[key]) {
					const keyString = key.toString();
					const valueString = JSON.stringify(file.frontmatter[key]);
					frontmatterHeader += `| ${keyString} | ${valueString} |\n`;
				}
			}
			markdown = frontmatterHeader + markdown;
		}

		const tags = [];
		if (
			file.frontmatter["tags"] &&
			Array.isArray(file.frontmatter["tags"])
		) {
			for (const label of file.frontmatter["tags"]) {
				if (typeof label === "string") {
					tags.push(label);
				}
			}
		}

		let pageId: string | undefined;
		if (file.frontmatter["connie-page-id"]) {
			switch (typeof file.frontmatter["connie-page-id"]) {
				case "string":
				case "number":
					pageId = file.frontmatter["connie-page-id"].toString();
					break;
				default:
					pageId = undefined;
			}
		}

		let dontChangeParentPageId = false;
		if (file.frontmatter["connie-dont-change-parent-page"]) {
			switch (typeof file.frontmatter["connie-dont-change-parent-page"]) {
				case "boolean":
					dontChangeParentPageId =
						file.frontmatter["connie-dont-change-parent-page"];
					break;
				default:
					dontChangeParentPageId = false;
			}
		}

		const adrobj = this.parse(markdown);

		return {
			...file,
			contents: adrobj,
			tags,
			pageId,
			dontChangeParentPageId,
		};
	}
}
