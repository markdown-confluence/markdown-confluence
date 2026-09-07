import { findMarkdownMatches } from "../MarkdownEmbeds";

export type Token = {
	new (type: string, tag: string, level: number): Token;
	type: string;
	content: string;
	level: number;
	nesting: number;
	tag: string;
	attrs?: string[][];
	children?: unknown[];
};

export interface MdState {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	Token: Token;
	tokens: Token[];
	env?: {
		references?: Record<string, { href: string; title: string }>;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	md: any;
}

function createRule() {
	const imagePattern = String.raw`!\[[^\]]*\]\([^)]+\)|!\[[^\]]*\]\[[^\]]*]|!\[\[[^\]\n]*\.[^\]\n]*\]\]`;
	const imageMatchRegex = new RegExp(imagePattern, "g");
	const referenceImageRegex = /^!\[(?<alt>[^\]]*)]\[(?<label>[^\]]*)]$/;
	const validParentTokens = [
		"blockquote_open",
		"expand_open",
		"panel_open",
		"th_open",
		"td_open",
		"list_item_open",
	];

	/**
	 * This function looks for strings that matches ![description](url) inside Inline-tokens.
	 * It will then split the Inline-token with content before and after the image, example:
	 *
	 * Input (tokens):
	 *   paragraph_open
	 *   inline - content: Hello ![](image.jpg) World!
	 *   paragraph_close
	 * Output (tokens):
	 *   paragraph_open
	 *   inline - content: Hello
	 *   paragraph_close
	 *   media_single_open
	 *   media
	 *   media_single_close
	 *   paragraph_open
	 *   inline - content: World!
	 *   paragraph_close
	 *
	 * This is applied before the inline content is parsed, to ensure that the formatting of
	 * remaining inline content (bold, links, etc.) is kept intact!
	 */
	return function media(State: MdState) {
		const createSizeAttrs = (sizeText: string | undefined): string[][] => {
			const match = sizeText?.trim().match(/^(?<width>\d+)(?:x(?<height>\d+))?$/);
			if (!match?.groups) {
				return [];
			}

			const { width, height } = match.groups;
			return [...(width ? [["width", width]] : []), ...(height ? [["height", height]] : [])];
		};

		const getAltSize = (str: string): string | undefined => {
			const altEnd = str.indexOf("]");
			const alt = altEnd > 2 ? str.slice(2, altEnd) : "";
			return alt.includes("|") ? alt.split("|").at(-1) : undefined;
		};

		const createUrlAttrs = (href: string) => {
			if (href.startsWith("http")) {
				return [
					["url", href],
					["type", "external"],
				];
			}
			return [
				["url", `file://${href}`],
				["type", "file"],
			];
		};

		const getUrl = (str: string) => {
			const res = State.md.helpers.parseLinkDestination(
				str,
				str.indexOf("(") + 1,
				str.length,
			);
			if (res.ok) {
				const href = State.md.normalizeLink(res.str);
				if (State.md.validateLink(href)) {
					return [...createUrlAttrs(href), ...createSizeAttrs(getAltSize(str))];
				}
			}

			return [
				["url", ""],
				["type", "external"],
			];
		};

		const getReferenceUrl = (str: string) => {
			const match = str.match(referenceImageRegex);
			const alt = match?.groups?.["alt"] ?? "";
			const label = match?.groups?.["label"] || alt;
			const normalizedReference = label.trim().replace(/\s+/g, " ").toUpperCase();
			const href = State.env?.references?.[normalizedReference]?.href;

			if (href && State.md.validateLink(href)) {
				return [
					...createUrlAttrs(State.md.normalizeLink(href)),
					...createSizeAttrs(getAltSize(str)),
				];
			}

			return [
				["url", ""],
				["type", "external"],
			];
		};

		const getWikiUrl = (str: string) => {
			const content = str.substring(str.indexOf("[[") + 2, str.length - 2);
			const contentSplit = content.split("|");

			const filename = contentSplit[0];

			return [
				["url", `file://${filename}`],
				["type", "file"],
				...createSizeAttrs(contentSplit[1]),
			];
		};

		const createMediaTokens = (url: string) => {
			const mediaSingleOpen = new State.Token("media_single_open", "", 1);
			const media = new State.Token("media", "", 0);
			media.attrs = url.startsWith("![[")
				? getWikiUrl(url)
				: referenceImageRegex.test(url)
					? getReferenceUrl(url)
					: getUrl(url);
			const mediaSingleClose = new State.Token("media_single_close", "", -1);

			return [mediaSingleOpen, media, mediaSingleClose];
		};

		const createInlineTokens = (
			str: string,
			openingTokens: Token[],
			closingTokens: Token[],
		) => {
			if (!str || str.length === 0) {
				return [];
			}

			const inlineBefore = new State.Token("inline", "", 1);
			inlineBefore.content = str;
			inlineBefore.children = [];

			return [...openingTokens, inlineBefore, ...closingTokens];
		};

		let processedTokens: string[] = [];
		const newTokens = State.tokens.reduce((tokens: Token[], token: Token) => {
			const matches =
				token.type === "inline" ? findMarkdownMatches(token.content, imageMatchRegex) : [];
			if (matches.length > 0) {
				const openingTokens: Token[] = [];
				const precedingTokens = [...tokens];
				let previousToken = precedingTokens.at(-1);
				let subTree: Token[] = [];

				while (previousToken && previousToken.nesting === 1) {
					if (validParentTokens.indexOf(previousToken.type) !== -1) {
						break;
					}

					openingTokens.unshift(previousToken);
					precedingTokens.pop();
					previousToken = precedingTokens.at(-1);
				}

				const closingTokens = openingTokens
					.map(
						(token) =>
							new State.Token(token.type.replace("_open", "_close"), token.tag, -1),
					)
					.reverse();

				let cursor = 0;
				matches.forEach((match) => {
					const start = match.index!;
					const contentBefore = token.content.slice(cursor, start);
					cursor = start + match[0].length;

					subTree = [
						...subTree,
						...createInlineTokens(contentBefore, openingTokens, closingTokens),
						...createMediaTokens(match[0]),
					];
				});

				const inlineContentStack = token.content.slice(cursor);
				if (inlineContentStack.length) {
					subTree = [
						...subTree,
						...createInlineTokens(inlineContentStack, openingTokens, closingTokens),
					];
				}

				processedTokens = [...processedTokens, ...closingTokens.map((c) => c.type)];

				tokens = [...precedingTokens, ...subTree];
			} else if (processedTokens.indexOf(token.type) !== -1) {
				// Ignore token if it's already processed
				processedTokens.splice(processedTokens.indexOf(token.type), 1);
			} else {
				tokens.push(token);
			}

			return tokens;
		}, []);

		State.tokens = newTokens;
		return true;
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const markdownItMedia = (md: any) => {
	md.core.ruler.before("inline", "media", createRule());
};
