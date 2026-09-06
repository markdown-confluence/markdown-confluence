import MarkdownIt from "markdown-it";

const parser = new MarkdownIt({ html: true });
type Range = readonly [number, number];

/** Source positions that Markdown treats as literal code or HTML. */
function literalRanges(markdown: string): Range[] {
	const lines = markdown.split("\n");
	const offsets = [0];
	for (const line of lines) offsets.push(offsets.at(-1)! + line.length + 1);
	const ranges: Range[] = [];
	const inlineRanges: Range[] = [];
	for (const token of parser.parse(markdown, {})) {
		if (token.type === "inline" && token.map)
			inlineRanges.push([offsets[token.map[0]]!, offsets[token.map[1]]!]);
		if (token.map && ["fence", "code_block", "html_block"].includes(token.type)) {
			ranges.push([offsets[token.map[0]]!, offsets[token.map[1]]!]);
		}
	}
	const pattern = /`+|<!--/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(markdown))) {
		const start = match.index;
		if (ranges.some(([from, to]) => start >= from && start < to) || isEscaped(markdown, start))
			continue;
		if (match[0] === "<!--") {
			const end = markdown.indexOf("-->", pattern.lastIndex);
			const stop = end < 0 ? markdown.length : end + 3;
			ranges.push([start, stop]);
			pattern.lastIndex = stop;
			continue;
		}
		const delimiter = match[0];
		const inlineRange = inlineRanges.find(([from, to]) => start >= from && start < to);
		if (!inlineRange) continue;
		const closing = /`+/g;
		closing.lastIndex = pattern.lastIndex;
		let end: RegExpExecArray | null;
		while ((end = closing.exec(markdown))) {
			if (end.index >= inlineRange[1]) break;
			if (end[0] === delimiter) {
				ranges.push([start, closing.lastIndex]);
				pattern.lastIndex = closing.lastIndex;
				break;
			}
		}
	}
	return ranges;
}

function isEscaped(markdown: string, position: number): boolean {
	let backslashes = 0;
	while (position > 0 && markdown[--position] === "\\") backslashes++;
	return backslashes % 2 === 1;
}

export function findMarkdownMatches(markdown: string, pattern: RegExp): RegExpMatchArray[] {
	const ranges = literalRanges(markdown);
	return [...markdown.matchAll(pattern)].filter(
		(match) =>
			!isEscaped(markdown, match.index!) &&
			!ranges.some(([start, end]) => match.index! >= start && match.index! < end),
	);
}

export function findMarkdownEmbeds(markdown: string): RegExpMatchArray[] {
	return findMarkdownMatches(markdown, /!\[\[([^\]\n]+)]]/g);
}

/** Select a heading section or an Obsidian block reference, never the whole file by accident. */
export function selectEmbeddedMarkdown(markdown: string, fragment: string | undefined): string {
	if (!fragment) return markdown;
	let decoded: string;
	try {
		decoded = decodeURIComponent(fragment);
	} catch {
		decoded = fragment;
	}
	const tokens = parser.parse(markdown, {});
	const lines = markdown.split("\n");
	const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index]!;
		if (
			decoded.startsWith("^") &&
			token.type === "inline" &&
			token.map &&
			token.content.trimEnd().endsWith(` ${decoded}`)
		) {
			return lines
				.slice(...token.map)
				.join("\n")
				.replace(new RegExp(` \\^${escapeRegExp(decoded.slice(1))}\\s*$`), "");
		}
		if (token.type !== "heading_open" || !token.map) continue;
		const inline = tokens[index + 1];
		const title =
			inline?.children?.map((child) => child.content).join("") ?? inline?.content ?? "";
		if (normalized(title) !== normalized(decoded)) continue;
		const level = Number(token.tag.slice(1));
		const next = tokens
			.slice(index + 1)
			.find(
				(candidate) =>
					candidate.type === "heading_open" && Number(candidate.tag.slice(1)) <= level,
			);
		return lines.slice(token.map[0], next?.map?.[0] ?? lines.length).join("\n");
	}
	throw new Error(`Embedded Markdown section or block not found: #${fragment}`);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rebase links in an included note while leaving code examples and absolute URLs intact. */
export function rebaseEmbeddedLinks(markdown: string, resolve: (target: string) => string): string {
	const ranges = literalRanges(markdown);
	return markdown.replace(
		/(!?\[\[)([^\]\n]+)(]])|(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^\s)]+)([^)\n]*\))/g,
		(
			match,
			wikiOpen: string | undefined,
			wikiTarget: string | undefined,
			wikiClose: string | undefined,
			linkOpen: string | undefined,
			linkTarget: string | undefined,
			linkClose: string | undefined,
			offset: number,
		) => {
			if (
				isEscaped(markdown, offset) ||
				ranges.some(([start, end]) => offset >= start && offset < end)
			)
				return match;
			const raw = wikiTarget ?? linkTarget!;
			const angled = raw.startsWith("<") && raw.endsWith(">");
			const value = angled ? raw.slice(1, -1) : raw;
			const split = value.search(/[|#?]/);
			const target = split < 0 ? value : value.slice(0, split);
			if (!target || target.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(target))
				return match;
			const suffix = split < 0 ? "" : value.slice(split);
			const resolved = resolve(target) + suffix;
			return wikiOpen
				? `${wikiOpen}${resolved}${wikiClose}`
				: `${linkOpen}${angled ? `<${resolved}>` : resolved}${linkClose}`;
		},
	);
}
