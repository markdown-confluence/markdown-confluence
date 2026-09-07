import type { App } from "obsidian";
import { Effect } from "effect";
import {
	transformMarkdownCodeBlocks,
	type MarkdownSourceTransformer,
} from "@markdown-confluence/lib";

/** The optional public Dataview API; no Dataview code is bundled or required by the CLI. */
export interface DataviewApi {
	index: {
		initialized: boolean;
		pages: Map<string, { mtime: { toMillis(): number } }>;
	};
	queryMarkdown(
		query: string,
		originFile: string,
		settings: { allowHtml: false },
	): Promise<{ successful: true; value: string } | { successful: false; error: string }>;
}

export interface DataviewSettings {
	renderDataview: boolean;
	ignoredCodeBlockLanguages?: readonly string[];
}

/** Create once per publication so changed dependency notes are checked again on every publish. */
export function createDataviewTransformer(
	app: App,
	settings: DataviewSettings,
): MarkdownSourceTransformer {
	const ignoredLanguages = new Set(
		settings.ignoredCodeBlockLanguages?.map((language) => language.trim().toLowerCase()),
	);
	let readyApi: DataviewApi | undefined;
	const getApi = () =>
		(
			app as App & {
				plugins?: { plugins?: { dataview?: { api?: DataviewApi } } };
			}
		).plugins?.plugins?.dataview?.api;

	const waitForIndex = Effect.gen(function* () {
		const api = getApi();
		if (!api || typeof api.queryMarkdown !== "function") {
			return yield* Effect.fail(
				new Error("Enable Dataview in this vault to publish query results."),
			);
		}
		// Dataview's metadata events are asynchronous. Comparing indexed mtimes also
		// catches a dependency edited immediately before publishing, without a full reindex.
		while (true) {
			if (getApi() !== api)
				return yield* Effect.fail(
					new Error("Dataview was disabled or reloaded during publication."),
				);
			const files = app.vault.getMarkdownFiles();
			const paths = new Set(files.map((file) => file.path));
			if (
				api.index.initialized &&
				files.every(
					(file) =>
						(api.index.pages.get(file.path)?.mtime.toMillis() ?? -1) >= file.stat.mtime,
				) &&
				[...api.index.pages.keys()].every((filePath) => paths.has(filePath))
			) {
				return api;
			}
			yield* Effect.sleep("50 millis");
		}
	}).pipe(
		Effect.timeout("15 seconds"),
		Effect.mapError((error) =>
			error instanceof Error && error.name !== "TimeoutError"
				? error
				: new Error(
						"Dataview indexing did not finish within 15 seconds. Wait for indexing, then publish again.",
					),
		),
	);

	return {
		transform(markdown, context) {
			if (!settings.renderDataview) return Effect.succeed(markdown);
			return transformMarkdownCodeBlocks(markdown, (block) =>
				Effect.gen(function* () {
					if (ignoredLanguages.has(block.language)) return undefined;
					if (block.language === "dataviewjs") {
						return yield* Effect.fail(
							new Error(
								"DataviewJS publication is not supported. Use a dataview TABLE, LIST or TASK query, or ignore dataviewjs blocks.",
							),
						);
					}
					if (block.language !== "dataview") return undefined;
					const api = readyApi ?? (yield* waitForIndex);
					readyApi = api;
					if (getApi() !== api)
						return yield* Effect.fail(
							new Error("Dataview was disabled or reloaded during publication."),
						);
					// Obsidian's platform paths are vault paths with an optional leading slash.
					const originFile = context.absoluteFilePath
						.replaceAll("\\", "/")
						.replace(/^\/+/, "");
					const result = yield* Effect.tryPromise({
						try: () =>
							api.queryMarkdown(block.content, originFile, { allowHtml: false }),
						catch: (error) =>
							error instanceof Error ? error : new Error(String(error)),
					}).pipe(
						Effect.timeout("30 seconds"),
						Effect.mapError((error) =>
							error instanceof Error && error.name !== "TimeoutError"
								? error
								: new Error("Dataview query exceeded 30 seconds."),
						),
					);
					if (!result.successful) return yield* Effect.fail(new Error(result.error));
					return result.value;
				}).pipe(
					Effect.mapError(
						(error) =>
							new Error(
								`Dataview in ${context.sourcePath} (line ${block.line}): ${error.message}`,
							),
					),
				),
			);
		},
	};
}
