import { Console, Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import {
	confluenceSettingsConfig,
	makeConfluenceSettingsConfigProvider,
	loadMarkdownWorkspace,
	validatePublishingFiles,
	planPublishingFiles,
	createAuthenticatedConfluenceClient,
} from "@markdown-confluence/lib";
import type { PreflightOptions } from "./command";

export function preflight(command: "validate" | "plan", options: PreflightOptions) {
	return Effect.gen(function* () {
		const provider = yield* makeConfluenceSettingsConfigProvider();
		const settings = yield* confluenceSettingsConfig.parse(provider);
		if (command === "validate" && !settings.confluenceBaseUrl)
			settings.confluenceBaseUrl = "https://confluence.invalid";
		const workspace = yield* Effect.tryPromise(() => loadMarkdownWorkspace(settings));
		const input = options.input;
		const files = input
			? [yield* workspace.loadMarkdownFile(input)]
			: yield* workspace.getMarkdownFilesToUpload;
		const report =
			command === "plan"
				? yield* Effect.tryPromise({
						try: async () => {
							const client = await Effect.runPromise(
								createAuthenticatedConfluenceClient(settings),
							);
							return planPublishingFiles(files, settings, client);
						},
						catch: (error) => error,
					})
				: validatePublishingFiles(files, settings);
		const fs = yield* FileSystem;
		const path = yield* Path;
		const output = options.output;
		const json = JSON.stringify(report, null, 2) + "\n";
		if (output && output !== "-") yield* fs.writeFileString(path.resolve(output), json);
		else yield* Console.log(json);
		const valid =
			"validation" in report
				? report.validation.valid && report.pages.every((page) => page.action !== "blocked")
				: report.valid;
		if (!valid) return yield* Effect.fail(new Error("Preflight failed; see the JSON report"));
	});
}
