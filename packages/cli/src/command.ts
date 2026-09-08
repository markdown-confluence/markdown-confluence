import { Console, Effect } from "effect";
import {
	parseConfluenceCommandLineOptions,
	RuntimeEnvironmentService,
} from "@markdown-confluence/lib";
import { conversionHelp, parseConversionOptions } from "./conversionOptions";

export type PreflightOptions = { input: string | undefined; output: string | undefined };

type CliCommand =
	| { kind: "help"; text: string }
	| { kind: "publish"; report: string | undefined }
	| { kind: "preflight"; command: "validate" | "plan"; options: PreflightOptions }
	| { kind: "convert"; command: "to-adf" | "to-markdown"; args: string[] };

type CommandHandlers<Failure, Requirements> = {
	publish: (report?: string) => Effect.Effect<void, Failure, Requirements>;
	preflight: (
		command: "validate" | "plan",
		options: PreflightOptions,
	) => Effect.Effect<void, Failure, Requirements>;
	convert: (
		command: "to-adf" | "to-markdown",
		args: string[],
	) => Effect.Effect<void, Failure, Requirements>;
};

export function parseCliCommand(args: string[]): CliCommand {
	const first = args[0];
	if (first === "to-adf" || first === "to-markdown" || first === "from-adf") {
		const command = first === "to-adf" ? "to-adf" : "to-markdown";
		const conversionArgs = args.slice(1);
		const options = parseConversionOptions(conversionArgs, command);
		return options.help
			? { kind: "help", text: conversionHelp(command) }
			: { kind: "convert", command, args: conversionArgs };
	}
	if (first === "validate" || first === "plan") {
		const options = parseConfluenceCommandLineOptions(args.slice(1), [
			{ name: "help", aliases: ["h"], type: "flag" },
			{ name: "input", type: "string" },
			{ name: "output", type: "string" },
		]);
		return options["help"]
			? {
					kind: "help",
					text: `${first} [--input FILE] [--output FILE|-] [publishing settings]\nvalidate works offline. plan performs only reads; existing pages are marked reconcile, not guessed unchanged.`,
				}
			: {
					kind: "preflight",
					command: first,
					options: {
						input: stringOption(options["input"]),
						output: stringOption(options["output"]),
					},
				};
	}
	if (first !== undefined && !first.startsWith("-"))
		throw new Error(`Unknown command: ${first}. Use --help for usage.`);
	const options = parseConfluenceCommandLineOptions(args, [
		{ name: "help", aliases: ["h"], type: "flag" },
		{ name: "report", type: "string" },
	]);
	return options["help"]
		? { kind: "help", text: cliHelp }
		: { kind: "publish", report: stringOption(options["report"]) };
}

function stringOption(value: string | boolean | undefined): string | undefined {
	return typeof value === "string" ? value : undefined;
}

// Parse before invoking any handler: publishing handlers load credentials and construct clients.
export function dispatchCommand<Failure, Requirements>(
	handlers: CommandHandlers<Failure, Requirements>,
) {
	return Effect.gen(function* () {
		const runtime = yield* RuntimeEnvironmentService;
		const argv = yield* runtime.argv;
		const command = yield* Effect.try({
			try: () => parseCliCommand(argv.slice(2)),
			catch: (error) => (error instanceof Error ? error : new Error(String(error))),
		});
		switch (command.kind) {
			case "help":
				return yield* Console.log(command.text);
			case "publish":
				return yield* handlers.publish(command.report);
			case "preflight":
				return yield* handlers.preflight(command.command, command.options);
			case "convert":
				return yield* handlers.convert(command.command, command.args);
		}
	});
}

const cliHelp =
	"Usage: markdown-confluence [publishing options]\n\nCommands:\n  validate     Validate selected Markdown without credentials\n  plan         Read-only Confluence page discovery\n  to-adf       Convert Markdown or export Confluence ADF\n  to-markdown  Convert ADF or a Confluence page to Markdown\n  from-adf     Alias for to-markdown\n\nUse COMMAND --help for command options. Without a command, publish using the configured settings.";
