import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

export function mathAttributes(token: Token) {
	return {
		extensionType: "markdown-confluence",
		extensionKey: "math",
		parameters: { source: token.content, display: token.type === "math_block" },
	};
}

function closingDollar(source: string, start: number, delimiter: string): number {
	for (let position = start; position < source.length; position++) {
		if (source[position] === "\\") {
			position++;
			continue;
		}
		if (source.startsWith(delimiter, position)) return position;
	}
	return -1;
}

/** Tokenize before Markdown interprets underscores/backslashes in TeX. */
export default function mathPlugin(md: MarkdownIt): void {
	md.inline.ruler.before("escape", "math_inline", (state, silent) => {
		if (
			state.src[state.pos] !== "$" ||
			state.src[state.pos - 1] === "$" ||
			state.src[state.pos + 1] === "$" ||
			/\s/.test(state.src[state.pos + 1] ?? " ")
		)
			return false;
		const end = closingDollar(state.src.slice(0, state.posMax), state.pos + 1, "$");
		if (end < 0 || /\s/.test(state.src[end - 1]!) || /\d/.test(state.src[end + 1] ?? ""))
			return false;
		const source = state.src.slice(state.pos + 1, end);
		if (source.includes("\n")) return false;
		if (!silent) state.push("math_inline", "", 0).content = source;
		state.pos = end + 1;
		return true;
	});
	md.block.ruler.before(
		"fence",
		"math_block",
		(state, startLine, endLine, silent) => {
			if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
			const start = state.bMarks[startLine]! + state.tShift[startLine]!;
			if (!state.src.startsWith("$$", start)) return false;
			const limit = state.bMarks[endLine] ?? state.src.length;
			const end = closingDollar(state.src.slice(0, limit), start + 2, "$$");
			if (end < 0) return false;
			let lastLine = startLine;
			while (lastLine + 1 < endLine && state.bMarks[lastLine + 1]! <= end) lastLine++;
			if (state.src.slice(end + 2, state.eMarks[lastLine]).trim()) return false;
			if (silent) return true;
			const token = state.push("math_block", "", 0);
			const lines: string[] = [];
			for (let line = startLine; line <= lastLine; line++) {
				lines.push(
					state.src.slice(
						line === startLine ? start + 2 : state.bMarks[line]! + state.tShift[line]!,
						line === lastLine ? end : state.eMarks[line],
					),
				);
			}
			token.content = lines.join("\n").trim();
			token.map = [startLine, lastLine + 1];
			state.line = lastLine + 1;
			return true;
		},
		{ alt: ["paragraph", "reference", "blockquote", "list"] },
	);
}
