import sortAny from "sort-any";
import { mapValues } from "lodash";
import { traverse } from "@atlaskit/adf-utils/traverse";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import deepEqual from "deep-equal";

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

export function orderMarks(adf: JSONDocNode) {
	return traverse(adf, {
		any: (node, __parent) => {
			if (node.marks) {
				node.marks = sortDeep(node.marks);
				return node;
			}
		},
	});
}

export function adfEqual(first: JSONDocNode, second: JSONDocNode): boolean {
	return deepEqual(orderMarks(first), orderMarks(second));
}
