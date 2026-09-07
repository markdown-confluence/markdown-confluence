import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Token from "markdown-it/lib/token.mjs";

/** A small formatting allowlist; HTML execution remains disabled. */
export default function formattingPlugin(markdown: MarkdownIt): void {
	markdown.inline.ruler.before("emphasis", "confluence_formatting", formatting);
	markdown.inline.ruler.before("emphasis", "confluence_emoji", emoji);
	markdown.core.ruler.push("confluence_code_marks", (state) => {
		for (const block of state.tokens) {
			if (!block.children) continue;
			const activeMarks: Token[] = [];
			const children: Token[] = [];
			for (const token of block.children) {
				// The ADF code mark excludes formatting marks. Close and reopen the
				// surrounding marks so ProseMirror does not also drop them after code.
				if (token.type === "code_inline") {
					for (const open of [...activeMarks].reverse())
						children.push(
							new state.Token(open.type.replace(/_open$/, "_close"), open.tag, -1),
						);
					children.push(
						token,
						...activeMarks.map((open) =>
							Object.assign(new state.Token(open.type, open.tag, 1), open),
						),
					);
					continue;
				}
				if (token.nesting === 1) activeMarks.push(token);
				if (token.nesting === -1) activeMarks.pop();
				children.push(token);
			}
			block.children = children;
		}
	});
}

function formatting(state: StateInline, silent: boolean): boolean {
	const source = state.src.slice(state.pos, state.posMax);
	const lineBreak = source.match(/^<br\s*\/?\s*>/i);
	if (lineBreak) {
		if (!silent) state.push("hardbreak", "br", 0);
		state.pos += lineBreak[0].length;
		return true;
	}
	const open = source.match(
		/^<(u|sub|sup)>|^<span\s+style="(color|background-color):\s*(#[\da-f]{3,8});?\s*">/i,
	);
	if (!open) return false;
	const tag = open[1]?.toLowerCase() ?? "span";
	const close = findClosingTag(state, tag, open[0].length);
	if (!close) return false;
	if (silent) {
		state.pos += close.end;
		return true;
	}
	const tokenType =
		tag === "u"
			? "underline"
			: tag === "span"
				? open[2]?.toLowerCase() === "color"
					? "text_color"
					: "background_color"
				: "subsup";
	const token = state.push(`${tokenType}_open`, tag, 1);
	if (tag === "span") token.attrSet("color", open[3]!);
	if (tag === "sub" || tag === "sup") token.attrSet("type", tag);
	const end = state.posMax;
	const start = state.pos;
	state.pos += open[0].length;
	state.posMax = start + close.index;
	state.md.inline.tokenize(state);
	state.push(`${tokenType}_close`, tag, -1);
	state.pos = start + close.end;
	state.posMax = end;
	return true;
}

function findClosingTag(
	state: StateInline,
	tag: string,
	start: number,
): { index: number; end: number } | undefined {
	const tags = new RegExp(`<(/?)${tag}(?:\\s[^>]*|)>`, "iy");
	const originalPosition = state.pos;
	let depth = 1;
	state.pos += start;
	try {
		while (state.pos < state.posMax) {
			tags.lastIndex = state.pos;
			const match = tags.exec(state.src);
			if (match) {
				depth += match[1] ? -1 : 1;
				if (depth === 0)
					return {
						index: match.index - originalPosition,
						end: tags.lastIndex - originalPosition,
					};
				state.pos = tags.lastIndex;
			} else {
				// Use the same tokenizer as Markdown so code spans, escapes and link
				// destinations cannot accidentally close an outer formatting tag.
				state.md.inline.skipToken(state);
			}
		}
	} finally {
		state.pos = originalPosition;
	}
	return undefined;
}

function emoji(state: StateInline, silent: boolean): boolean {
	const match = state.src.slice(state.pos, state.posMax).match(/^:([\w-]+)\|([\w-]+):/);
	if (!match) return false;
	if (!silent) {
		const token = state.push("confluence_emoji", "", 0);
		token.attrSet("id", match[1]!);
		token.attrSet("shortName", `:${match[2]}:`);
	}
	state.pos += match[0].length;
	return true;
}
