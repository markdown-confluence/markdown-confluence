/* eslint-disable @typescript-eslint/no-explicit-any */

import { defaultSchema } from "@atlaskit/adf-schema/schema-default";
import MarkdownIt from "markdown-it";
import { markdownItTable } from "markdown-it-table";
import { MarkdownParser } from "@atlaskit/editor-prosemirror/markdown";
import { Schema, Node as PMNode } from "@atlaskit/editor-prosemirror/model";
import { markdownItMedia } from "./media";
import myTokenizer from "./callout";
import wikilinksPlugin from "./wikilinks";
import highlightPlugin from "./highlight";
import formattingPlugin from "./formatting";
import mathPlugin, { mathAttributes } from "./math";

interface Transformer<T> {
	encode(node: PMNode): T;
	parse(content: T): PMNode;
}

function filterMdToPmSchemaMapping(schema: Schema, map: any) {
	return Object.keys(map).reduce((newMap: any, key: string) => {
		const value = map[key];
		const block = value.block || value.node;
		const mark = value.mark;

		if ((block && schema.nodes[block]) || (mark && schema.marks[mark])) {
			newMap[key] = value;
		}
		return newMap;
	}, {});
}

interface SchemaMapping {
	nodes: { [key: string]: string | string[] };
	marks: { [key: string]: string | string[] };
}

const pmSchemaToMdMapping: SchemaMapping = {
	nodes: {
		blockquote: "blockquote",
		paragraph: "paragraph",
		rule: "hr",
		// lheading (---, ===)
		heading: ["heading", "lheading"],
		codeBlock: ["code", "fence"],
		listItem: "list",
		image: "image",
		panel: "panel",
		expand: "expand",
	},
	marks: {
		em: "emphasis",
		strong: "text",
		link: ["link", "autolink", "reference", "linkify"],
		strike: "strikethrough",
		code: "backticks",
	},
};

const mdToPmMapping = {
	math_inline: { node: "inlineExtension", attrs: mathAttributes },
	math_block: { node: "extension", attrs: mathAttributes },
	alignment: { mark: "alignment", attrs: (token: any) => ({ align: token.attrGet("align") }) },
	underline: { mark: "underline" },
	subsup: { mark: "subsup", attrs: (token: any) => ({ type: token.attrGet("type") }) },
	text_color: { mark: "textColor", attrs: (token: any) => ({ color: token.attrGet("color") }) },
	background_color: {
		mark: "backgroundColor",
		attrs: (token: any) => ({ color: token.attrGet("color") }),
	},
	confluence_emoji: {
		node: "emoji",
		attrs: (token: any) => ({ id: token.attrGet("id"), shortName: token.attrGet("shortName") }),
	},
	blockquote: { block: "blockquote" },
	paragraph: { block: "paragraph" },
	em: { mark: "em" },
	strong: { mark: "strong" },
	link: {
		mark: "link",
		attrs: (tok: any) => ({
			href: tok.attrGet("href"),
			title: tok.attrGet("title") || null,
		}),
	},
	hr: { node: "rule" },
	heading: {
		block: "heading",
		attrs: (tok: any) => ({ level: +tok.tag.slice(1) }),
	},
	softbreak: { node: "hardBreak" },
	hardbreak: { node: "hardBreak" },
	code_block: { block: "codeBlock" },
	list_item: { block: "listItem" },
	bullet_list: { block: "bulletList" },
	ordered_list: {
		block: "orderedList",
		attrs: (tok: any) => ({ order: +tok.attrGet("start") || 1 }),
	},
	code_inline: { mark: "code" },
	fence: {
		block: "codeBlock",
		// we trim any whitespaces around language definition
		attrs: (tok: any) => ({
			language: (tok.info && tok.info.trim()) || null,
		}),
	},
	media_single: {
		block: "mediaSingle",
		attrs: () => ({}),
	},
	media: {
		node: "media",
		attrs: (tok: any) => {
			return {
				url: tok.attrGet("url"),
				type: tok.attrGet("type"),
				width: tok.attrGet("width"),
				height: tok.attrGet("height"),
			};
		},
	},
	emoji: {
		node: "emoji",
		attrs: (tok: any) => ({
			shortName: `:${tok.markup}:`,
			text: tok.content,
		}),
	},
	table: { block: "table" },
	tr: { block: "tableRow" },
	th: { block: "tableHeader" },
	td: { block: "tableCell" },
	s: { mark: "strike" },
	panel: {
		block: "panel",
		attrs: (tok: any) => {
			return {
				panelType: tok.attrGet("panelType"),
				panelIcon: tok.attrGet("panelIcon"),
				panelIconId: tok.attrGet("panelIconId"),
				panelIconText: tok.attrGet("panelIconText"),
				panelColor: tok.attrGet("panelColor"),
			};
		},
	},
	expand: {
		block: "expand",
		attrs: (tok: any) => {
			return {
				title: tok.attrGet("title"),
			};
		},
	},
};

const md = MarkdownIt("commonmark", {
	html: false,
	linkify: true,
});

md.enable([
	// Process html entity - &#123;, &#xAF;, &quot;, ...
	"entity",
	// Process escaped chars and hardbreaks
	"escape",
]);

export type Markdown = string;

export class MarkdownTransformer implements Transformer<Markdown> {
	private markdownParser: MarkdownParser;
	constructor(schema: Schema = defaultSchema, tokenizer: MarkdownIt = md) {
		// Enable markdown plugins based on schema
		if (schema.nodes["panel"]) {
			tokenizer.use(myTokenizer);
		}

		tokenizer.use(wikilinksPlugin);
		tokenizer.use(highlightPlugin);
		tokenizer.use(formattingPlugin);
		tokenizer.use(mathPlugin);

		(["nodes", "marks"] as (keyof SchemaMapping)[]).forEach((key) => {
			for (const idx in pmSchemaToMdMapping[key]) {
				const toEnable = pmSchemaToMdMapping[key][idx];
				if (schema[key][idx] && toEnable) {
					tokenizer.enable(toEnable);
				}
			}
		});

		if (schema.nodes["table"]) {
			tokenizer.use(markdownItTable);
			tokenizer.core.ruler.push("table_alignment", (state) => {
				for (let index = 0; index < state.tokens.length; index++) {
					const token = state.tokens[index]!;
					if (token.type !== "th_open" && token.type !== "td_open") continue;
					const alignment = token
						.attrGet("style")
						?.match(/text-align:\s*(left|right|center)/)?.[1];
					const paragraph = state.tokens[index + 1];
					if (alignment && paragraph?.type === "paragraph_open") {
						const open = new state.Token("alignment_open", "", 1);
						open.attrSet(
							"align",
							alignment === "right"
								? "end"
								: alignment === "left"
									? "start"
									: "center",
						);
						state.tokens.splice(index + 1, 0, open);
						const closeIndex = state.tokens.findIndex(
							(candidate, position) =>
								position > index + 1 && candidate.type === "paragraph_close",
						);
						if (closeIndex !== -1)
							state.tokens.splice(
								closeIndex + 1,
								0,
								new state.Token("alignment_close", "", -1),
							);
					}
				}
			});
		}

		if (schema.nodes["media"] && schema.nodes["mediaSingle"]) {
			tokenizer.use(markdownItMedia);
		}

		this.markdownParser = new MarkdownParser(
			schema,
			tokenizer,
			filterMdToPmSchemaMapping(schema, mdToPmMapping),
		);
	}
	encode(_node: PMNode): Markdown {
		throw new Error("This is not implemented yet");
	}

	parse(content: Markdown): PMNode {
		const pmnodes = this.markdownParser.parse(content);
		if (!pmnodes) {
			throw new Error("Unable to parse Markdown");
		}
		return pmnodes;
	}
}
