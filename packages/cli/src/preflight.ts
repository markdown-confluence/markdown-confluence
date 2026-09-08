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

export function preflight(command: "validate" | "plan", args: string[]) {
	return Effect.gen(function* () {
		if (args.includes("--help"))
			return yield* Console.log(
				`${command} [--input FILE] [--output FILE|-] [publishing settings]\nvalidate works offline. plan performs only reads; existing pages are marked reconcile, not guessed unchanged.`,
			);
		const argument = (name: string) => {
			const index = args.indexOf(name);
			if (index < 0) return undefined;
			const value = args[index + 1];
			if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
			return value;
		};
		const provider = yield* makeConfluenceSettingsConfigProvider();
		const settings = yield* confluenceSettingsConfig.parse(provider);
		if (command === "validate" && !settings.confluenceBaseUrl)
			settings.confluenceBaseUrl = "https://confluence.invalid";
		const workspace = yield* Effect.tryPromise(() => loadMarkdownWorkspace(settings));
		const input = argument("--input");
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
		const output = argument("--output");
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
