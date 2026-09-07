import type { JSONDocNode } from "@atlaskit/editor-json-transformer";

export type AdfValue = {
	type: string;
	attrs?: Record<string, unknown>;
	content?: AdfValue[];
	marks?: { type: string; attrs?: Record<string, unknown>; [key: string]: unknown }[];
	text?: string;
	[key: string]: unknown;
};

/** Validate structure without deleting extension nodes or attributes from newer schemas. */
export function isAdfValue(value: unknown, depth = 0): value is AdfValue {
	if (!isRecord(value) || depth > 100 || typeof value["type"] !== "string" || !value["type"])
		return false;
	if (value["attrs"] !== undefined && !isRecord(value["attrs"])) return false;
	if (value["text"] !== undefined && typeof value["text"] !== "string") return false;
	if (value["type"] === "text" && typeof value["text"] !== "string") return false;
	if (
		value["content"] !== undefined &&
		(!Array.isArray(value["content"]) ||
			!value["content"].every((child) => isAdfValue(child, depth + 1)))
	)
		return false;
	if (
		value["marks"] !== undefined &&
		(!Array.isArray(value["marks"]) ||
			!value["marks"].every(
				(mark) =>
					isRecord(mark) &&
					typeof mark["type"] === "string" &&
					(mark["attrs"] === undefined || isRecord(mark["attrs"])),
			))
	)
		return false;
	return true;
}

export function readAdfDocument(input: unknown): JSONDocNode {
	let value = typeof input === "string" ? JSON.parse(input) : input;
	if (isRecord(value) && isRecord(value["body"])) {
		const body = value["body"]["atlas_doc_format"];
		if (isRecord(body)) value = body["value"];
	}
	if (typeof value === "string") value = JSON.parse(value);
	if (
		!isAdfValue(value) ||
		value.type !== "doc" ||
		value["version"] !== 1 ||
		!Array.isArray(value.content)
	) {
		throw new Error(
			"Expected an ADF document with type 'doc', version 1, and a content array (or a Confluence response containing body.atlas_doc_format.value).",
		);
	}
	return value as JSONDocNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function adfCodeFence(value: unknown): string {
	return fencedCode("adf", JSON.stringify(value, null, 2));
}

export function fencedCode(language: string, code: string): string {
	const runs = code.match(/`+/g) ?? [];
	const marker = "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
	return `${marker}${language.replace(/[\r\n`]/g, "")}\n${code}\n${marker}`;
}

/** Restore after Markdown normalization so raw ADF is never rewritten as Markdown. */
export function restoreAdfCodeBlocks(document: JSONDocNode): JSONDocNode {
	const restore = (node: AdfValue): AdfValue[] => {
		if (node.type === "codeBlock" && node.attrs?.["language"] === "adf") {
			try {
				const value: unknown = JSON.parse(
					(node.content ?? []).map((child) => child.text ?? "").join(""),
				);
				if (isAdfValue(value)) {
					if (value.type === "doc") return readAdfDocument(value).content as AdfValue[];
					return [value];
				}
			} catch {
				/* Invalid examples remain ordinary fenced code. */
			}
			return [node];
		}
		return [{ ...node, ...(node.content ? { content: node.content.flatMap(restore) } : {}) }];
	};
	const onlyChild =
		document.content?.length === 1 ? (document.content[0] as AdfValue) : undefined;
	if (onlyChild?.type === "codeBlock" && onlyChild.attrs?.["language"] === "adf") {
		try {
			return readAdfDocument(
				(onlyChild.content ?? []).map((child) => child?.text ?? "").join(""),
			);
		} catch {
			/* A single node fence is handled below. */
		}
	}
	return restore(document as AdfValue)[0] as JSONDocNode;
}
