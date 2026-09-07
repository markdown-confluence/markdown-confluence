import { Console, Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import {
	parseMarkdownToADF,
	convertADFToMarkdown,
	StandardInputService,
	fetchConfluencePageAdf,
	confluenceReadSettingsConfig,
	makeConfluenceSettingsConfigProvider,
} from "@markdown-confluence/lib";
import { conversionHelp, parseConversionOptions } from "./conversionOptions";

export function convertDocument(command: "to-adf" | "to-markdown", args: string[]) {
	return Effect.gen(function* () {
		const options = yield* Effect.try({
			try: () => parseConversionOptions(args, command),
			catch: toError,
		});
		if (options.help) return yield* Console.log(conversionHelp(command));
		const fs = yield* FileSystem;
		const path = yield* Path;
		let input: unknown;
		if (options.page) {
			const provider = yield* makeConfluenceSettingsConfigProvider();
			const settings = yield* confluenceReadSettingsConfig
				.parse(provider)
				.pipe(Effect.mapError(toError));
			input = yield* fetchConfluencePageAdf(settings, options.page);
			options.baseUrl = settings.confluenceSiteUrl || settings.confluenceBaseUrl;
		} else {
			input =
				options.input && options.input !== "-"
					? yield* fs.readFileString(path.resolve(options.input), "utf-8")
					: yield* (yield* StandardInputService).readAll;
		}
		const output = yield* Effect.try({
			try: () =>
				command === "to-adf"
					? JSON.stringify(
							options.page
								? input
								: parseMarkdownToADF(input as string, options.baseUrl),
							null,
							2,
						)
					: convertADFToMarkdown(input, options),
			catch: toError,
		});
		if (options.output && options.output !== "-")
			yield* fs.writeFileString(path.resolve(options.output), `${output}\n`);
		else yield* Console.log(output);
	});
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
