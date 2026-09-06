import { parseMarkdownToADF, StandardInputService } from "@markdown-confluence/lib";
import { Console, Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

export function markdownToAdf(args: string[]) {
	return Effect.gen(function* () {
		const options = yield* Effect.try(() => parseToAdfOptions(args));
		const fs = yield* FileSystem;
		const path = yield* Path;
		const markdown = options.input
			? yield* fs.readFileString(path.resolve(options.input), "utf-8")
			: yield* (yield* StandardInputService).readAll;
		const adf = yield* Effect.try(() => parseMarkdownToADF(markdown, options.baseUrl));
		const output = JSON.stringify(adf, null, 2);
		if (options.output) {
			yield* fs.writeFileString(path.resolve(options.output), `${output}\n`);
		} else {
			yield* Console.log(output);
		}
	});
}

type ToAdfOptions = {
	input?: string;
	output?: string;
	baseUrl: string;
};

export function parseToAdfOptions(args: string[]): ToAdfOptions {
	const options: ToAdfOptions = {
		baseUrl: "https://confluence.atlassian.com",
	};

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg) {
			continue;
		}

		if (arg === "-o" || arg === "--output") {
			options.output = requireOptionValue(arg, args[++index]);
			continue;
		}

		if (arg.startsWith("--output=")) {
			options.output = requireOptionValue("--output", arg.slice("--output=".length));
			continue;
		}

		if (arg === "-b" || arg === "--base-url") {
			options.baseUrl = requireOptionValue(arg, args[++index]);
			continue;
		}

		if (arg.startsWith("--base-url=")) {
			options.baseUrl = requireOptionValue("--base-url", arg.slice("--base-url=".length));
			continue;
		}

		if (arg.startsWith("-")) {
			throw new Error(`Unknown to-adf option: ${arg}`);
		}

		if (options.input) {
			throw new Error("Only one Markdown input file can be converted.");
		}

		options.input = arg;
	}

	return options;
}

function requireOptionValue(option: string, value: string | undefined) {
	if (!value || value.startsWith("--")) {
		throw new Error(`${option} requires a value.`);
	}

	return value;
}
