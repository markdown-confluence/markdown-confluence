import MarkdownIt from "markdown-it";
import StateInline from "markdown-it/lib/rules_inline/state_inline";

export function wikilinks(state: StateInline): boolean {
	const max = state.posMax;

	if (
		state.src.charCodeAt(state.pos) !== 0x5b ||
		state.src.charCodeAt(state.pos + 1) !== 0x5b /* [ */
	) {
		return false;
	}

	const wikilinkStart = state.pos + 2;
	const wikiLinkEnd = findLinkEnd(state, state.pos);
	if (wikiLinkEnd < 0) {
		return false;
	}

	const { hashFragment, headerStart, headerEnd } = findLinkToHeader(
		state,
		state.pos,
		wikiLinkEnd,
	);

	if (hashFragment) {
		state.src = replaceBetween(
			state.src,
			headerStart,
			headerEnd,
			hashFragment,
		);
	}

	const { alias, aliasStart, aliasEnd } = findAlias(
		state,
		state.pos,
		wikiLinkEnd,
	);

	const pageNameStart = wikilinkStart;
	const pageNameEnd = Math.min(
		wikiLinkEnd,
		headerStart > 0 ? headerStart : wikiLinkEnd,
		aliasStart > 0 ? aliasStart - 1 : wikiLinkEnd,
	);
	const linkToPage = state.src.slice(pageNameStart, pageNameEnd);

	if (alias) {
		state.pos = aliasStart;
		state.posMax = aliasEnd;
	} else {
		state.pos = wikilinkStart;
		state.posMax = wikiLinkEnd;
	}

	const href = linkToPage.startsWith("mention:")
		? linkToPage
		: `wikilinks:${linkToPage}${hashFragment ?? ""}`;

	let token = state.push("link_open", "a", 1);
	token.attrs = [["href", href]];
	state.md.inline.tokenize(state);
	token = state.push("link_close", "a", -1);

	state.pos = wikiLinkEnd + 2;
	state.posMax = max;
	return true;
}

function replaceBetween(
	original: string,
	start: number,
	end: number,
	replacement: string,
) {
	return original.substring(0, start) + replacement + original.substring(end);
}

function findLinkEnd(state: StateInline, start: number) {
	let labelEnd = -1;
	let found = false;

	const max = state.posMax,
		oldPos = state.pos;

	state.pos = start + 2;

	while (state.pos < max) {
		if (
			state.src.charCodeAt(state.pos - 1) === 0x5d &&
			state.src.charCodeAt(state.pos) === 0x5d
		) {
			found = true;
			break;
		}

		state.md.inline.skipToken(state);
	}

	if (found) {
		labelEnd = state.pos - 1;
	}

	// restore old state
	state.pos = oldPos;

	return labelEnd;
}

function findLinkToHeader(
	state: StateInline,
	start: number,
	max: number,
): {
	hashFragment: string | undefined;
	headerStart: number;
	headerEnd: number;
} {
	let headerStart = -1,
		headerEnd = -1,
		found = false,
		foundStart = false,
		hashFragment = undefined;
	const oldPos = state.pos;

	state.pos = start + 2;

	while (state.pos <= max) {
		if (state.src.charCodeAt(state.pos) === 0x23 /* # */) {
			foundStart = true;
			headerStart = state.pos;
		}

		if (
			foundStart &&
			(state.src.charCodeAt(state.pos) === 0x5d /* ] (Link End) */ ||
				state.src.charCodeAt(state.pos) === 0x7c) /* | (Alias Start) */
		) {
			found = true;
			break;
		}

		state.pos++;
	}

	if (found) {
		headerEnd = state.pos;
		hashFragment = state.src.slice(headerStart, headerEnd);
	} else {
		headerStart = -1;
		headerEnd = -1;
	}

	// restore old state
	state.pos = oldPos;

	const cleanHashFragment = hashFragment?.replace(/ /g, "-");
	return { hashFragment: cleanHashFragment, headerStart, headerEnd };
}

function findAlias(
	state: StateInline,
	start: number,
	max: number,
): { alias: string | undefined; aliasStart: number; aliasEnd: number } {
	let aliasStart = -1,
		aliasEnd = -1,
		found = false,
		foundStart = false,
		alias = undefined;
	const oldPos = state.pos;

	state.pos = start + 2;

	while (state.pos <= max) {
		if (state.src.charCodeAt(state.pos) === 0x7c /* # */) {
			foundStart = true;
			aliasStart = state.pos + 1;
		}

		if (
			foundStart &&
			state.src.charCodeAt(state.pos + 1) === 0x5d /* ] (Link End) */
		) {
			found = true;
			break;
		}

		state.pos++;
	}

	if (found) {
		aliasEnd = state.pos + 1;
		alias = state.src.slice(aliasStart, aliasEnd);
	}

	// restore old state
	state.pos = oldPos;

	return { alias, aliasStart, aliasEnd };
}

export default function wikilinksPlugin(md: MarkdownIt): void {
	md.inline.ruler.push("wikilinks", wikilinks);
}
