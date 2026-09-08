import { filter, traverse } from "@atlaskit/adf-utils/traverse";
import type { ADFEntity } from "@atlaskit/adf-utils/types";
import type { JSONDocNode } from "@atlaskit/editor-json-transformer";
import SparkMD5 from "spark-md5";
import type { UploadedImageData } from "../Attachments";
import type { MathExpression, MathRenderer } from "../MathRenderer";
import type { ADFProcessingPlugin, PublisherFunctions } from "./types";

export function readMathExpression(node: ADFEntity): MathExpression | undefined {
	if (
		!["inlineExtension", "extension"].includes(node.type) ||
		node.attrs?.["extensionType"] !== "markdown-confluence" ||
		node.attrs?.["extensionKey"] !== "math"
	)
		return;
	const parameters = node.attrs["parameters"];
	if (typeof parameters?.source !== "string") return;
	const display = node.type === "extension";
	const source = parameters.source;
	return {
		source,
		display,
		name: `RenderedMath-${SparkMD5.hash(JSON.stringify(["mathjax4-tex-png-2x-v1", source, display]))}.png`,
	};
}

export class MathRendererPlugin implements ADFProcessingPlugin<
	MathExpression[],
	Map<string, UploadedImageData>
> {
	constructor(private renderer: MathRenderer) {}
	extract(adf: JSONDocNode): MathExpression[] {
		const expressions = filter(adf, (node) => !!readMathExpression(node)).map((node) =>
			readMathExpression(node)!,
		);
		return [
			...new Map(expressions.map((expression) => [expression.name, expression])).values(),
		];
	}
	async transform(expressions: MathExpression[], support: PublisherFunctions) {
		const images = await this.renderer.captureMath(expressions);
		const uploaded = new Map<string, UploadedImageData>();
		for (const expression of expressions) {
			const image = images.get(expression.name);
			if (!image) throw new Error(`Math renderer did not produce ${expression.name}`);
			const attachment = await support.uploadBuffer(expression.name, image, "image/png");
			if (!attachment) throw new Error(`Math upload failed: ${expression.name}`);
			uploaded.set(expression.name, attachment);
		}
		return uploaded;
	}
	load(adf: JSONDocNode, images: Map<string, UploadedImageData>): JSONDocNode {
		const replace = (node: ADFEntity) => {
			const expression = readMathExpression(node);
			if (!expression) return;
			const image = images.get(expression.name);
			if (!image) throw new Error(`Missing rendered equation: ${expression.name}`);
			const attrs = {
				type: expression.display ? "file" : "image",
				id: image.id,
				collection: image.collection,
				width: image.width / 2,
				height: image.height / 2,
			};
			return expression.display
				? {
						type: "mediaSingle",
						attrs: { layout: "center" },
						content: [{ type: "media", attrs }],
					}
				: {
						type: "mediaInline",
						attrs,
						...(node.marks?.some((mark) => mark.type === "link")
							? { marks: node.marks.filter((mark) => mark.type === "link") }
							: {}),
					};
		};
		return traverse(adf, { extension: replace, inlineExtension: replace }) as JSONDocNode;
	}
}
