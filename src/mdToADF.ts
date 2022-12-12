import {
	JSONDocNode,
	JSONTransformer,
} from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { ConfluenceTransformer } from "@atlaskit/editor-confluence-transformer";
import { confluenceSchema as schema } from "@atlaskit/adf-schema/schema-confluence";

export default class MdToADF {
	transformer: MarkdownTransformer;
	serializer: JSONTransformer;
	frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;
	confluenceSerializer: ConfluenceTransformer;
	constructor() {
		this.transformer = new MarkdownTransformer();
		this.serializer = new JSONTransformer();
		this.confluenceSerializer = new ConfluenceTransformer(schema);
	}

	parse(markdown: string): JSONDocNode {
		markdown = markdown.replace(this.frontmatterRegex, "");
		const prosenodes = this.transformer.parse(markdown);
		return this.serializer.encode(prosenodes);
	}

	convertConfluenceToADF(cxhtml: string): JSONDocNode {
		const prosenodes = this.confluenceSerializer.parse(cxhtml);
		return this.serializer.encode(prosenodes);
	}
}
