import { ADFEntity } from "@atlaskit/adf-utils/types";
import { heading, li, ol, p, text } from "@atlaskit/adf-utils/builders";
import { TextDefinition } from "@atlaskit/adf-schema";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";

export const INLINE_COMMENT_LIMITS = Object.freeze({
	contextCodeUnits: 4_096,
	candidatesPerComment: 256,
	annotationsPerPage: 1_000,
	distanceCells: 5_000_000,
	inspectedCodeUnits: 8_000_000,
} as const);

export type InlineCommentLimits = { [Key in keyof typeof INLINE_COMMENT_LIMITS]: number };

export class InlineCommentLimitError extends Error {
	constructor(readonly limit: keyof InlineCommentLimits) {
		super(`Inline comment safety limit reached (${limit}); the page was not updated.`);
		this.name = "InlineCommentLimitError";
	}
}

export class InlineCommentWork {
	readonly limits: InlineCommentLimits;
	inspectedCodeUnits = 0;
	distanceCells = 0;
	maximumRowLength = 0;
	maximumDistanceThreshold = 0;

	constructor(limits: InlineCommentLimits = INLINE_COMMENT_LIMITS) {
		const snapshot = { ...limits };
		for (const key of Object.keys(INLINE_COMMENT_LIMITS) as (keyof InlineCommentLimits)[]) {
			const value = snapshot[key];
			if (!Number.isSafeInteger(value) || value < 1) {
				throw new Error("Inline comment limits must be positive finite safe integers");
			}
		}
		this.limits = Object.freeze(snapshot);
	}

	inspect(count = 1) {
		if (count > this.limits.inspectedCodeUnits - this.inspectedCodeUnits) {
			throw new InlineCommentLimitError("inspectedCodeUnits");
		}
		this.inspectedCodeUnits += count;
	}

	cell(count = 1) {
		if (count > this.limits.distanceCells - this.distanceCells) {
			throw new InlineCommentLimitError("distanceCells");
		}
		this.distanceCells += count;
	}
}

type TextLocation = { parent: ADFEntity; node: ADFEntity; start: number; end: number };
type InlineComment = TextLocation & { id: string; text: string };
type Context = { before: string; after: string };

// Iterative traversal does not consume the JavaScript call stack for nested ADF.
function* textLocations(document: JSONDocNode, work: InlineCommentWork) {
	const stack: { parent: ADFEntity; index: number }[] = [{ parent: document, index: 0 }];
	while (stack.length > 0) {
		const frame = stack[stack.length - 1]!;
		const children = frame.parent.content;
		if (!children || frame.index >= children.length) {
			stack.pop();
			continue;
		}
		work.inspect();
		const node = children[frame.index++];
		if (!node) continue;
		if (node.type === "text") {
			yield { parent: frame.parent, node, start: 0, end: node.text?.length ?? 0 };
		}
		if (node.content) stack.push({ parent: node, index: 0 });
	}
}

function extractComments(document: JSONDocNode, work: InlineCommentWork) {
	const comments: InlineComment[] = [];
	for (const location of textLocations(document, work)) {
		for (const mark of location.node.marks ?? []) {
			work.inspect();
			if (mark.type !== "annotation" || mark.attrs?.["annotationType"] !== "inlineComment")
				continue;
			if (comments.length >= work.limits.annotationsPerPage) {
				throw new InlineCommentLimitError("annotationsPerPage");
			}
			const commentText = location.node.text ?? "";
			work.inspect(commentText.length);
			comments.push({ ...location, id: mark.attrs["id"], text: commentText });
		}
	}
	return comments;
}

function contextFor(location: TextLocation, work: InlineCommentWork): Context {
	const before: string[] = [],
		after: string[] = [];
	let found = false;
	for (const sibling of location.parent.content ?? []) {
		work.inspect();
		if (sibling === location.node) {
			found = true;
			const nodeText = sibling.text ?? "";
			work.inspect(location.start + nodeText.length - location.end);
			before.push(nodeText.slice(0, location.start));
			after.push(nodeText.slice(location.end));
		} else {
			// Keep the original sibling-context semantics for non-text inline nodes.
			const siblingText = String(sibling?.text);
			work.inspect(siblingText.length);
			(found ? after : before).push(siblingText);
		}
	}
	return { before: before.join(""), after: after.join("") };
}

// KMP gives candidate discovery a countable linear bound, including repeated anchors.
function patternTable(pattern: string, work: InlineCommentWork) {
	work.inspect(pattern.length);
	const prefix = new Uint32Array(pattern.length);
	let matched = 0;
	for (let index = 1; index < pattern.length; index++) {
		work.inspect();
		while (matched > 0 && pattern[index] !== pattern[matched]) {
			work.inspect();
			matched = prefix[matched - 1]!;
		}
		if (pattern[index] === pattern[matched]) matched++;
		prefix[index] = matched;
	}
	return prefix;
}

function candidatesFor(document: JSONDocNode, comment: InlineComment, work: InlineCommentWork) {
	const candidates: TextLocation[] = [];
	if (!comment.text) return candidates;
	const prefix = patternTable(comment.text, work);
	for (const location of textLocations(document, work)) {
		const nodeText = location.node.text ?? "";
		let matched = 0;
		for (let index = 0; index < nodeText.length; index++) {
			work.inspect();
			while (matched > 0 && nodeText[index] !== comment.text[matched]) {
				work.inspect();
				matched = prefix[matched - 1]!;
			}
			if (nodeText[index] === comment.text[matched]) matched++;
			if (matched !== comment.text.length) continue;
			if (candidates.length >= work.limits.candidatesPerComment) {
				throw new InlineCommentLimitError("candidatesPerComment");
			}
			candidates.push({ ...location, start: index + 1 - matched, end: index + 1 });
			// Preserve the original non-overlapping occurrence search.
			matched = 0;
		}
	}
	return candidates;
}

function equalText(first: string, second: string, work: InlineCommentWork) {
	if (first.length !== second.length) return false;
	work.inspect(first.length);
	return first === second;
}

function specialCharacter(character: string) {
	return /[^\p{L}\p{N}\p{M}_]/u.test(character);
}

function matchingBoundary(first: Context, second: Context) {
	return (
		!(
			first.before &&
			second.before &&
			specialCharacter(first.before.at(-1)!) !== specialCharacter(second.before.at(-1)!)
		) &&
		!(
			first.after &&
			second.after &&
			specialCharacter(first.after[0]!) !== specialCharacter(second.after[0]!)
		)
	);
}

export function boundedCommentDistance(
	first: string,
	second: string,
	threshold: number,
	work: InlineCommentWork,
): number {
	if (!Number.isSafeInteger(threshold) || threshold < 0)
		throw new Error("Invalid comment distance threshold");
	if (
		first.length > work.limits.contextCodeUnits ||
		second.length > work.limits.contextCodeUnits
	) {
		throw new InlineCommentLimitError("contextCodeUnits");
	}
	// Larger thresholds cannot change an edit distance and must not overflow typed rows.
	threshold = Math.min(threshold, Math.max(first.length, second.length));
	work.maximumDistanceThreshold = Math.max(work.maximumDistanceThreshold, threshold);
	const outside = threshold + 1;
	if (Math.abs(first.length - second.length) > threshold) return outside;
	if (!first.length) return second.length;
	if (!second.length) return first.length;
	const rowLength = second.length + 1;
	work.cell(rowLength * 2);
	work.maximumRowLength = Math.max(work.maximumRowLength, rowLength);
	let previous = new Uint32Array(rowLength).fill(outside);
	let current = new Uint32Array(rowLength).fill(outside);
	work.cell(Math.min(second.length, threshold) + 1);
	for (let column = 0; column <= Math.min(second.length, threshold); column++)
		previous[column] = column;
	for (let row = 1; row <= first.length; row++) {
		const start = Math.max(1, row - threshold),
			end = Math.min(second.length, row + threshold);
		work.cell(1 + Number(start > 1) + Number(end < second.length));
		current[0] = row <= threshold ? row : outside;
		if (start > 1) current[start - 1] = outside;
		if (end < second.length) current[end + 1] = outside;
		let minimum = current[0]!;
		for (let column = start; column <= end; column++) {
			work.cell();
			const distance = Math.min(
				previous[column]! + 1,
				current[column - 1]! + 1,
				previous[column - 1]! + (first[row - 1] === second[column - 1] ? 0 : 1),
			);
			current[column] = Math.min(outside, distance);
			minimum = Math.min(minimum, distance);
		}
		if (minimum > threshold) return outside;
		[previous, current] = [current, previous];
	}
	return Math.min(outside, previous[second.length]!);
}

function nearbyWords(value: string, before: boolean, work: InlineCommentWork) {
	work.inspect(value.length);
	const boundary = before ? value.search(/(\w)[^\w]*$/) : value.search(/\w/);
	let spaces = 0;
	for (
		let index = boundary;
		before ? index >= 0 : index < value.length;
		index += before ? -1 : 1
	) {
		work.inspect();
		if (value[index] === " " && ++spaces === 2)
			return before ? value.slice(index + 1) : value.slice(0, index);
	}
	return value;
}

function bestCandidate(document: JSONDocNode, comment: InlineComment, work: InlineCommentWork) {
	const candidates = candidatesFor(document, comment, work);
	if (!candidates.length) return undefined;
	const original = contextFor(comment, work);
	for (const candidate of candidates) {
		const context = contextFor(candidate, work);
		if (
			equalText(original.before, context.before, work) &&
			equalText(original.after, context.after, work)
		)
			return candidate;
	}
	if (
		original.before.length > work.limits.contextCodeUnits ||
		original.after.length > work.limits.contextCodeUnits
	) {
		throw new InlineCommentLimitError("contextCodeUnits");
	}
	let best: TextLocation | undefined,
		bestDistance = Infinity,
		acceptable = 0;
	for (const candidate of candidates) {
		const context = contextFor(candidate, work);
		if (!matchingBoundary(original, context)) continue;
		if (
			context.before.length > work.limits.contextCodeUnits ||
			context.after.length > work.limits.contextCodeUnits
		) {
			throw new InlineCommentLimitError("contextCodeUnits");
		}
		const before = boundedCommentDistance(original.before, context.before, 40, work);
		const after = boundedCommentDistance(original.after, context.after, 40, work);
		if (before > 40 && after > 40) continue;
		acceptable++;
		const distance = Math.min(before, after);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}
	// Preserve the existing ranking, including its word fallback for one candidate.
	if (acceptable > 1) return best;
	best = undefined;
	bestDistance = Infinity;
	for (const candidate of candidates) {
		const context = contextFor(candidate, work);
		if (!matchingBoundary(original, context)) continue;
		if (
			context.before.length > work.limits.contextCodeUnits ||
			context.after.length > work.limits.contextCodeUnits
		) {
			throw new InlineCommentLimitError("contextCodeUnits");
		}
		const originalBefore = nearbyWords(original.before, true, work),
			candidateBefore = nearbyWords(context.before, true, work);
		const originalAfter = nearbyWords(original.after, false, work),
			candidateAfter = nearbyWords(context.after, false, work);
		const beforeLength = Math.min(originalBefore.length, candidateBefore.length),
			afterLength = Math.min(originalAfter.length, candidateAfter.length);
		const beforeThreshold = Math.floor(beforeLength / 2),
			afterThreshold = Math.floor(afterLength / 2);
		const before = boundedCommentDistance(
			originalBefore.slice(originalBefore.length - beforeLength),
			candidateBefore.slice(candidateBefore.length - beforeLength),
			beforeThreshold,
			work,
		);
		const after = boundedCommentDistance(
			originalAfter.slice(0, afterLength),
			candidateAfter.slice(0, afterLength),
			afterThreshold,
			work,
		);
		if (before > beforeThreshold && after > afterThreshold) continue;
		const rankedBefore =
			before <= beforeThreshold
				? before
				: boundedCommentDistance(
						originalBefore.slice(originalBefore.length - beforeLength),
						candidateBefore.slice(candidateBefore.length - beforeLength),
						after,
						work,
					);
		const rankedAfter =
			after <= afterThreshold
				? after
				: boundedCommentDistance(
						originalAfter.slice(0, afterLength),
						candidateAfter.slice(0, afterLength),
						before,
						work,
					);
		const distance = Math.min(rankedBefore, rankedAfter);
		if (distance < bestDistance) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best;
}

function applyComment(location: TextLocation, comment: InlineComment, work: InlineCommentWork) {
	const children = location.parent.content!;
	work.inspect(
		children.length + (location.node.marks?.length ?? 0) + (location.node.text?.length ?? 0),
	);
	const index = children.indexOf(location.node);
	if (index < 0) return false;
	const value = location.node.text ?? "";
	const marks = [...(location.node.marks ?? [])];
	if (
		!marks.some(
			(mark) =>
				mark.type === "annotation" &&
				mark.attrs?.["annotationType"] === "inlineComment" &&
				mark.attrs?.["id"] === comment.id,
		)
	) {
		marks.push({
			type: "annotation",
			attrs: { annotationType: "inlineComment", id: comment.id },
		});
	}
	children.splice(
		index,
		1,
		...(location.start ? [{ ...location.node, text: value.slice(0, location.start) }] : []),
		{ ...location.node, text: comment.text, marks },
		...(location.end < value.length
			? [{ ...location.node, text: value.slice(location.end) }]
			: []),
	);
	return true;
}

export function remapInlineComments(
	document: JSONDocNode,
	existing: JSONDocNode,
	limits: InlineCommentLimits = INLINE_COMMENT_LIMITS,
) {
	const work = new InlineCommentWork(limits);
	// Extraction must complete before modifying the page; a failure cannot lose IDs.
	const comments = extractComments(existing, work);
	// Lossless source can already carry an ID. Do not duplicate it in fallback when
	// a later matching budget is exhausted, or move its explicitly retained anchor.
	const retainedIds = new Set(
		comments.length ? extractComments(document, work).map((comment) => comment.id) : [],
	);
	const unmapped: InlineComment[] = [];
	let limitReached = false,
		exhausted = false;
	for (const comment of comments) {
		if (retainedIds.has(comment.id)) continue;
		if (exhausted) {
			unmapped.push(comment);
			continue;
		}
		try {
			const candidate = bestCandidate(document, comment, work);
			if (!candidate || !applyComment(candidate, comment, work)) unmapped.push(comment);
		} catch (error) {
			if (!(error instanceof InlineCommentLimitError)) throw error;
			limitReached = true;
			exhausted = error.limit === "distanceCells" || error.limit === "inspectedCodeUnits";
			unmapped.push(comment);
		}
	}
	if (unmapped.length) {
		document.content.push(
			heading({ level: 1 })(text("Inline comments that couldn't be mapped")),
			ol({ order: 1 })(
				...unmapped.map((comment) =>
					li([
						p({
							type: "text",
							text: comment.text,
							marks: [
								{
									type: "annotation",
									attrs: { annotationType: "inlineComment", id: comment.id },
								},
							],
						} as TextDefinition),
					]),
				),
			),
		);
	}
	return { document, unmappedCount: unmapped.length, limitReached, work };
}
