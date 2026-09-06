import MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";

function highlight(state: StateInline, silent: boolean): boolean {
	if (state.src.slice(state.pos, state.pos + 2) !== "==") {
		return false;
	}

	const contentStart = state.pos + 2;
	const contentEnd = state.src.indexOf("==", contentStart);

	if (contentEnd === -1 || contentEnd === contentStart) {
		return false;
	}

	if (silent) {
		return true;
	}

	const max = state.posMax;
	const oldPos = state.pos;

	state.push("strong_open", "strong", 1);
	state.pos = contentStart;
	state.posMax = contentEnd;
	state.md.inline.tokenize(state);
	state.push("strong_close", "strong", -1);

	state.pos = contentEnd + 2;
	state.posMax = max;

	if (state.pos <= oldPos) {
		return false;
	}

	return true;
}

export default function highlightPlugin(md: MarkdownIt): void {
	md.inline.ruler.before("emphasis", "highlight", highlight);
}
