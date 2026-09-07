import type { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { renderADFDoc } from "./ADFToMarkdown";
import { parseMarkdownToADF } from "./MdToADF";
import { adfCodeFence, readAdfDocument } from "./AdfDocument";

export type AdfToMarkdownOptions = {
	/** Preserve all attributes, marks and extension payloads. Defaults to true. */
	lossless?: boolean;
	baseUrl?: string;
};

export function convertADFToMarkdown(input: unknown, options: AdfToMarkdownOptions = {}): string {
	const document = readAdfDocument(input);
	if (options.lossless === false) return renderADFDoc(document);
	const baseUrl = options.baseUrl ?? "https://confluence.atlassian.com";
	const blocks = (document.content ?? []).map((node) => {
		const fragment = { version: 1, type: "doc", content: [node] } as JSONDocNode;
		try {
			const markdown = renderADFDoc(fragment);
			return sameJson(parseMarkdownToADF(markdown, baseUrl), fragment)
				? markdown.trimEnd()
				: adfCodeFence(node);
		} catch {
			return adfCodeFence(node);
		}
	});
	const markdown = blocks.join("\n\n");
	// Adjacent lists, empty paragraphs and document metadata also need protection.
	return sameJson(parseMarkdownToADF(markdown, baseUrl), document)
		? markdown
		: adfCodeFence(document);
}

function sameJson(left: unknown, right: unknown): boolean {
	return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function canonicalJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalJson);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, canonicalJson(child)]),
		);
	}
	return value;
}
