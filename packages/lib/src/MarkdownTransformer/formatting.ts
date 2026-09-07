import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";

/** A small formatting allowlist; HTML execution remains disabled. */
export default function formattingPlugin(markdown: MarkdownIt): void {
	markdown.inline.ruler.before("emphasis", "confluence_formatting", formatting);
	markdown.inline.ruler.before("emphasis", "confluence_emoji", emoji);
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
	const close = findClosingTag(source, tag, open[0].length);
	if (close === -1) return false;
	if (silent) return true;
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
	state.posMax = start + close;
	state.md.inline.tokenize(state);
	state.push(`${tokenType}_close`, tag, -1);
	state.pos = start + close + tag.length + 3;
	state.posMax = end;
	return true;
}

function findClosingTag(source: string, tag: string, start: number): number {
	const tags = new RegExp(`<(/?)${tag}(?:\\s[^>]*|)>`, "gi");
	tags.lastIndex = start;
	let depth = 1;
	for (let match = tags.exec(source); match; match = tags.exec(source)) {
		depth += match[1] ? -1 : 1;
		if (depth === 0) return match.index;
	}
	return -1;
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
