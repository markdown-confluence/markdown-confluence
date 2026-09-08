import type MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token.mjs";
import footnote from "markdown-it-footnote";
import SparkMD5 from "spark-md5";

export function footnoteAnchorAttributes(token: Token) {
	return {
		extensionType: "com.atlassian.confluence.macro.core",
		extensionKey: "anchor",
		parameters: { macroParams: { "": { value: token.content } } },
	};
}

/** Adapt parser tokens, never regex-rewrite code or escaped Markdown text. */
export default function footnotes(md: MarkdownIt) {
	// The DefinitelyTyped plugin uses CJS MarkdownIt types; runtime API is identical.
	md.use(footnote as unknown as (markdown: MarkdownIt) => void);
	md.core.ruler.after("footnote_tail", "confluence_footnotes", (state) => {
		const anchor = (name: string) => {
			const token = new Token("footnote_target", "", 0);
			token.content = name;
			return token;
		};
		const text = (value: string) => {
			const token = new Token("text", "", 0);
			token.content = value;
			return token;
		};
		const link = (name: string, value: string) => {
			const open = new Token("link_open", "a", 1);
			open.attrSet("href", `#${name}`);
			return [open, text(value), new Token("link_close", "a", -1)];
		};
		const target = (token: Token) => {
			const label = state.env.footnotes.list[token.meta.id]?.label ?? String(token.meta.id);
			return `connie-fn-${state.env.confluenceFragment ?? "body"}-${SparkMD5.hash(label)}`;
		};
		const reference = (token: Token) => `${target(token)}-ref-${token.meta.subId ?? 0}`;
		const rewriteInline = (tokens: Token[]): Token[] =>
			tokens.flatMap((token) => {
				if (token.type === "footnote_ref")
					return [
						anchor(reference(token)),
						...link(target(token), `[${token.meta.id + 1}]`),
					];
				if (token.type === "footnote_anchor") return link(reference(token), " ↩");
				if (token.children) token.children = rewriteInline(token.children);
				return [token];
			});
		state.tokens = state.tokens.flatMap((token) => {
			if (token.type === "footnote_block_open") return [new Token("hr", "hr", 0)];
			if (token.type === "footnote_block_close" || token.type === "footnote_close") return [];
			if (token.type === "footnote_open") {
				const inline = new Token("inline", "", 0);
				inline.children = [anchor(target(token)), text(`[${token.meta.id + 1}]`)];
				return [
					new Token("paragraph_open", "p", 1),
					inline,
					new Token("paragraph_close", "p", -1),
				];
			}
			return rewriteInline([token]);
		});
	});
}
