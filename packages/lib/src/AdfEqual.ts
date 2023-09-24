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
		if (
			typeof object !== "object" ||
			object === null ||
			object instanceof Date
		) {
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

export function adfEqual(first: ADFEntity, second: ADFEntity): boolean {
	return isEqual(orderMarks(first), orderMarks(second));
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
