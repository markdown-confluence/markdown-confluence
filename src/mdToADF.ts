import {
	JSONDocNode,
	JSONTransformer,
} from "@atlaskit/editor-json-transformer";
import { MarkdownTransformer } from "./MarkdownTransformer";

export default class MdToADF {
	transformer: MarkdownTransformer;
	serializer: JSONTransformer;
	frontmatterRegex: RegExp = /^\s*?---\n([\s\S]*?)\n---/g;
	constructor() {
		this.transformer = new MarkdownTransformer();
		this.serializer = new JSONTransformer();
	}

	parse(markdown: string): JSONDocNode {
		markdown = markdown.replace(this.frontmatterRegex, "");
		const prosenodes = this.transformer.parse(markdown);
		return this.serializer.encode(prosenodes);
	}
}
