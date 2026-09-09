import { expect, test } from "@effect/vitest";
import { ADFEntity } from "@atlaskit/adf-utils/types";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import {
	boundedCommentDistance,
	INLINE_COMMENT_LIMITS,
	InlineCommentLimitError,
	InlineCommentLimits,
	InlineCommentWork,
	remapInlineComments,
} from "./InlineCommentMapping";

function document(...paragraphs: ADFEntity[][]): JSONDocNode {
	return {
		type: "doc",
		version: 1,
		content: paragraphs.map((content) => ({ type: "paragraph", content })),
	} as JSONDocNode;
}
function text(value: string): ADFEntity {
	return { type: "text", text: value };
}
function annotated(value: string, ...ids: string[]): ADFEntity {
	return {
		...text(value),
		marks: ids.map((id) => ({
			type: "annotation",
			attrs: { annotationType: "inlineComment", id },
		})),
	};
}
function ids(document: ADFEntity): string[] {
	return [
		...(document.marks ?? [])
			.filter((mark) => mark.type === "annotation")
			.map((mark) => mark.attrs!["id"]),
		...(document.content ?? []).flatMap((child) => (child ? ids(child) : [])),
	];
}
function referenceDistance(first: string, second: string) {
	const matrix = Array.from({ length: first.length + 1 }, (_, index) => [index]);
	matrix[0] = Array.from({ length: second.length + 1 }, (_, index) => index);
	for (let row = 1; row <= first.length; row++) {
		for (let column = 1; column <= second.length; column++) {
			matrix[row]![column] = Math.min(
				matrix[row - 1]![column]! + 1,
				matrix[row]![column - 1]! + 1,
				matrix[row - 1]![column - 1]! + (first[row - 1] === second[column - 1] ? 0 : 1),
			);
		}
	}
	return matrix[first.length]![second.length]!;
}

test("bounded distance preserves exact results through the acceptance threshold", () => {
	const values = ["", "a", "ab", "ba", "abc", "abab", "😀", "café", "a ".repeat(4)];
	for (const first of values)
		for (const second of values)
			for (const threshold of [0, 1, 2, 40]) {
				const work = new InlineCommentWork();
				expect(boundedCommentDistance(first, second, threshold, work)).toBe(
					Math.min(threshold + 1, referenceDistance(first, second)),
				);
				expect(work.maximumRowLength).toBeLessThanOrEqual(second.length + 1);
			}
	for (const changes of [40, 41]) {
		expect(
			boundedCommentDistance(
				"a".repeat(50),
				"b".repeat(changes) + "a".repeat(50 - changes),
				40,
				new InlineCommentWork(),
			),
		).toBe(changes);
	}
});

test("long nonexact contexts preserve annotations without allocating distance rows", () => {
	const source = document([text("b" + "a".repeat(50_000) + "Anchor")]);
	const remote = document([text("a".repeat(50_000)), annotated("Anchor", "original")]);
	const result = remapInlineComments(source, remote);
	expect(result.unmappedCount).toBe(1);
	expect(result.limitReached).toBe(true);
	expect(result.work.distanceCells).toBe(0);
	expect(ids(source)).toEqual(["original"]);
});

test("long exact contexts still map within the scan budget", () => {
	const source = document([text("a".repeat(50_000) + "Anchor")]);
	const remote = document([text("a".repeat(50_000)), annotated("Anchor", "original")]);
	const result = remapInlineComments(source, remote);
	expect(result.unmappedCount).toBe(0);
	expect(result.limitReached).toBe(false);
	expect(result.work.distanceCells).toBe(0);
	expect(ids(source)).toEqual(["original"]);
});

test("a no-space word fallback consumes the same finite distance budget", () => {
	const source = document([text("b".repeat(200) + "Anchor" + "d".repeat(200))]);
	const remote = document([
		text("a".repeat(200)),
		annotated("Anchor", "original"),
		text("c".repeat(200)),
	]);
	const result = remapInlineComments(source, remote, {
		...INLINE_COMMENT_LIMITS,
		distanceCells: 10_000,
	});
	expect(result.work.maximumDistanceThreshold).toBe(100);
	expect(result.work.distanceCells).toBeLessThanOrEqual(10_000);
	expect(result.work.maximumRowLength).toBeLessThanOrEqual(201);
	expect(result.limitReached).toBe(true);
	expect(result.unmappedCount).toBe(1);
	expect(ids(source)).toEqual(["original"]);
});

test("candidate overflow preserves the comment instead of selecting from a partial set", () => {
	const source = document([text("Anchor Anchor Anchor")]);
	const remote = document([annotated("Anchor", "original")]);
	const result = remapInlineComments(source, remote, {
		...INLINE_COMMENT_LIMITS,
		candidatesPerComment: 2,
	});
	expect(result.unmappedCount).toBe(1);
	expect(result.limitReached).toBe(true);
	expect(source.content[0]!.content![0]!.marks).toBeUndefined();
	expect(ids(source)).toEqual(["original"]);
});

test("aggregate matching work preserves remaining IDs without restarting its budget", () => {
	const source = document([text("Before Anchor after")]);
	const remote = document([
		text("Before "),
		annotated("Anchor", "one", "two", "three"),
		text(" after"),
	]);
	const result = remapInlineComments(source, remote, {
		...INLINE_COMMENT_LIMITS,
		inspectedCodeUnits: 200,
	});
	expect(result.limitReached).toBe(true);
	expect(result.unmappedCount).toBeGreaterThan(0);
	expect(result.work.inspectedCodeUnits).toBeLessThanOrEqual(200);
	expect(ids(source).sort()).toEqual(["one", "three", "two"]);
});

test("extraction limits fail before modifying the source document", () => {
	const source = document([text("Anchor")]);
	const original = structuredClone(source);
	const remote = document([annotated("Anchor", "one", "two")]);
	expect(() =>
		remapInlineComments(source, remote, { ...INLINE_COMMENT_LIMITS, annotationsPerPage: 1 }),
	).toThrow(InlineCommentLimitError);
	expect(source).toEqual(original);
});

test("unmapped annotation fallback is stable through repeated publication", () => {
	const source = document([text("Changed")]);
	const remote = document([annotated("Anchor", "one", "two")]);
	const first = remapInlineComments(structuredClone(source), remote).document;
	const second = remapInlineComments(structuredClone(source), structuredClone(first)).document;
	expect(second).toEqual(first);
	expect(ids(second)).toEqual(["one", "two"]);
});

test("already retained annotation IDs are not duplicated when another comment exhausts its budget", () => {
	const source = document([annotated("Anchor", "retained"), text(" Before Other after")]);
	const remote = document([
		annotated("Anchor", "retained"),
		text(" Before "),
		annotated("Other", "other"),
		text(" after"),
	]);
	const result = remapInlineComments(source, remote, {
		...INLINE_COMMENT_LIMITS,
		inspectedCodeUnits: 100,
	});
	expect(result.limitReached).toBe(true);
	expect(ids(source).sort()).toEqual(["other", "retained"]);
});

test("all budget fields must be finite and are snapshotted before use", () => {
	for (const invalid of [undefined, 0, -1, Infinity, NaN, 1.5]) {
		expect(
			() =>
				new InlineCommentWork({
					...INLINE_COMMENT_LIMITS,
					distanceCells: invalid,
				} as unknown as InlineCommentLimits),
		).toThrow("positive finite safe integers");
	}
	expect(() => new InlineCommentWork({} as InlineCommentLimits)).toThrow(
		"positive finite safe integers",
	);
	const limits = { ...INLINE_COMMENT_LIMITS, distanceCells: 10 };
	const work = new InlineCommentWork(limits);
	limits.distanceCells = 100;
	work.cell(10);
	expect(() => work.cell()).toThrow(InlineCommentLimitError);
	expect(Object.isFrozen(work.limits)).toBe(true);
});
