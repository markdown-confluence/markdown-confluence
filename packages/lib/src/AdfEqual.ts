import sortAny from "sort-any";
import { mapValues } from "lodash-es";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { ADFEntity, ADFEntityMark } from "@atlaskit/adf-utils/types";
import { isEqual } from "./isEqual";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sortDeep = (object: unknown): any => {
	if (object instanceof Map) {
		return sortAny([...object]);
	}
	if (!Array.isArray(object)) {
		if (typeof object !== "object" || object === null || object instanceof Date) {
			return object;
		}

		return mapValues(object, sortDeep);
	}

	return sortAny(object.map(sortDeep));
};

export function orderMarks(adf: ADFEntity) {
	return traverse(adf, {
		any: (node, __parent) => {
			if (node.marks) {
				node.marks = sortDeep(node.marks);
			}
			return node;
		},
	});
}

export function normalizeAdfForComparison(adf: ADFEntity): ADFEntity {
	return traverse(cloneAdf(adf), {
		any: (node, __parent) => {
			if (node.marks) {
				node.marks = sortDeep(node.marks);
			}

			for (const mark of node.marks ?? []) {
				if (mark.type === "link" && typeof mark.attrs?.["href"] === "string") {
					mark.attrs["href"] = canonicalConfluencePageLink(mark.attrs["href"]);
				}
			}
			// Confluence writes the default pixel display width onto media wrappers.
			if (
				node.type === "mediaSingle" &&
				node.attrs?.["widthType"] === "pixel" &&
				node.attrs["width"] === node.content?.[0]?.attrs?.["width"]
			) {
				delete node.attrs["width"];
				delete node.attrs["widthType"];
			}

			const parameters = node.attrs?.["parameters"];
			if (
				isRecord(parameters) &&
				Object.prototype.hasOwnProperty.call(parameters, "macroMetadata")
			) {
				const semanticParameters = { ...parameters };
				delete semanticParameters["macroMetadata"];
				node.attrs = {
					...node.attrs,
					parameters: semanticParameters,
				};
			}

			return node;
		},
	}) as ADFEntity;
}

export function adfEqual(first: ADFEntity, second: ADFEntity): boolean {
	return isEqual(normalizeAdfForComparison(first), normalizeAdfForComparison(second));
}

export function marksEqual(
	first: ADFEntityMark[] | undefined,
	second: ADFEntityMark[] | undefined,
) {
	if (first === second) {
		return true;
	}

	return isEqual(sortDeep(first), sortDeep(second));
}

function cloneAdf(adf: ADFEntity): ADFEntity {
	return JSON.parse(JSON.stringify(adf)) as ADFEntity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalConfluencePageLink(href: string): string {
	try {
		const url = new URL(href);
		if (url.protocol !== "https:" && url.protocol !== "http:") return href;
		const match = url.pathname.match(/^(\/wiki\/spaces\/[^/]+\/pages\/\d+)(?:\/[^/]*)?$/);
		if (!match?.[1]) return href;
		url.pathname = match[1];
		return url.href;
	} catch {
		return href;
	}
}
