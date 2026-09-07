import { Context, Effect } from "effect";

export interface MarkdownSourceContext {
	/** Platform path of the original note, including when processing an embed. */
	absoluteFilePath: string;
	/** Slash-separated path relative to the configured content root. */
	sourcePath: string;
	frontmatter: Readonly<Record<string, unknown>>;
}

export interface MarkdownSourceTransformer {
	transform(markdown: string, context: MarkdownSourceContext): Effect.Effect<string, Error>;
}

/** Publication-only processing; raw reads and frontmatter write-back never use this hook. */
export const MarkdownSourceTransformerService = Context.Reference<MarkdownSourceTransformer>(
	"@markdown-confluence/MarkdownSourceTransformer",
	{ defaultValue: () => ({ transform: (markdown) => Effect.succeed(markdown) }) },
);

/** Limits content preparation while retaining other eligible notes for the page/link mapping. */
export const MarkdownPublishFilter = Context.Reference<string | undefined>(
	"@markdown-confluence/MarkdownPublishFilter",
	{ defaultValue: () => undefined },
);
