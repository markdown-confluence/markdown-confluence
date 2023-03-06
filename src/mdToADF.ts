import {
	JSONDocNode,
	JSONTransformer,
} from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { ConfluenceTransformer } from "@atlaskit/editor-confluence-transformer";
import { confluenceSchema as schema } from "@atlaskit/adf-schema/schema-confluence";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { ADFEntity } from "@atlaskit/adf-utils/types";

export default class MdToADF {
	transformer: MarkdownTransformer;
	serializer: JSONTransformer;
	confluenceSerializer: ConfluenceTransformer;
	constructor() {
		this.transformer = new MarkdownTransformer();
		this.serializer = new JSONTransformer();
		this.confluenceSerializer = new ConfluenceTransformer(schema);
	}

	parse(markdown: string): ADFEntity {
		const prosenodes = this.transformer.parse(markdown);
		const adfNodes = this.serializer.encode(prosenodes);
		const nodes = this.replaceLinkWithInlineSmartCard(adfNodes);
		return nodes;
	}

	replaceLinkWithInlineSmartCard(adf: JSONDocNode): ADFEntity {
		const olivia = traverse(adf, {
			text: (node, parent) => {
				if (
					node.marks &&
					node.marks[0].type === "link" &&
					node.marks[0].attrs &&
					node.marks[0].attrs.href === node.text
				) {
					node.type = "inlineCard";
					node.attrs = { url: node.marks[0].attrs.href };
					delete node.marks;
					delete node.text;
					return node;
				}
			},
		});

		console.log({ textingReplacement: JSON.stringify(olivia) });

		if (!olivia) {
			throw new Error("Failed to traverse");
		}

		return olivia;
	}

	convertConfluenceToADF(cxhtml: string): JSONDocNode {
		const prosenodes = this.confluenceSerializer.parse(cxhtml);
		return this.serializer.encode(prosenodes);
	}
}
