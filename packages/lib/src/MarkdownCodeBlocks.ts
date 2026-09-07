import MarkdownIt from "markdown-it";
import { Effect } from "effect";

const parser = new MarkdownIt({ html: true });

export interface MarkdownCodeBlock {
	language: string;
	content: string;
	/** One-based line in the supplied Markdown (which may be an embedded section). */
	line: number;
}

/** Replace real fenced blocks once, preserving surrounding source and container indentation. */
export function transformMarkdownCodeBlocks(
	markdown: string,
	transform: (block: MarkdownCodeBlock) => Effect.Effect<string | undefined, Error>,
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const lines = markdown.split("\n");
		const offsets = [0];
		for (const line of lines) offsets.push(offsets.at(-1)! + line.length + 1);
		const replacements: { start: number; end: number; content: string }[] = [];
		for (const token of parser.parse(markdown, {})) {
			if (token.type !== "fence" || !token.map) continue;
			const replacement = yield* transform({
				language: token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? "",
				content: token.content,
				line: token.map[0] + 1,
			});
			if (replacement === undefined) continue;
			const opening = lines[token.map[0]]!;
			const prefix = opening.slice(0, opening.indexOf(token.markup));
			const continuation = prefix.replace(
				/(^|>[ \t]*)([-+*]|\d+[.)])([ \t]+)/g,
				(_match, before: string, marker: string, whitespace: string) =>
					before + " ".repeat(marker.length + whitespace.length),
			);
			const content = replacement
				.replace(/\r\n/g, "\n")
				.trimEnd()
				.split("\n")
				.map((line, index) => `${index === 0 ? prefix : continuation}${line}`)
				.join("\n");
			replacements.push({
				start: offsets[token.map[0]]!,
				end: Math.min(offsets[token.map[1]]!, markdown.length),
				content: `${content}\n`,
			});
		}
		let result = markdown;
		for (const replacement of replacements.reverse()) {
			result =
				result.slice(0, replacement.start) +
				replacement.content +
				result.slice(replacement.end);
		}
		return result;
	});
}
