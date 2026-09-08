#!/usr/bin/env node
import { KrokiRendererPlugin, HttpKrokiRenderer } from "@markdown-confluence/lib";

import { NodeRuntime } from "@effect/platform-node";
import chalk from "chalk";
import boxen from "boxen";
import { Console, Effect } from "effect";
import {
	ADFProcessingPlugin,
	ConfluenceSettingsLive,
	ConfluenceUploadSettings,
	MarkdownWorkspaceLive,
	MarkdownConfluencePlatformLive,
	Publisher,
	MermaidRendererPlugin,
	MathRendererPlugin,
	PlantumlRendererPlugin,
	RuntimeEnvironmentService,
	createAuthenticatedConfluenceClient,
	StandardInputLive,
} from "@markdown-confluence/lib";
import {
	PuppeteerMermaidRenderer,
	PuppeteerMathRenderer,
} from "@markdown-confluence/mermaid-puppeteer-renderer";
import { getErrorMessage } from "./errorMessage";
import { preflight } from "./preflight";
import { FileSystem } from "effect/FileSystem";
import { publishingReport } from "@markdown-confluence/lib";
import { convertDocument } from "./convert";
import { HttpPlantumlRenderer } from "@markdown-confluence/plantuml-renderer";

const program = Effect.gen(function* () {
	const runtimeEnvironment = yield* RuntimeEnvironmentService as any;
	yield* runtimeEnvironment.setMaxListeners(Infinity) as any;

	const settings = yield* ConfluenceUploadSettings.ConfluenceSettingsService as any;
	const argv: string[] = yield* runtimeEnvironment.argv;
	const reportIndex = argv.indexOf("--report");
	const destination = reportIndex >= 0 ? argv[reportIndex + 1] : undefined;
	if (reportIndex >= 0 && (!destination || destination.startsWith("--")))
		throw new Error("--report requires a file path or - for stdout");

	const confluenceClient = yield* createAuthenticatedConfluenceClient(settings);

	const plugins: ADFProcessingPlugin<unknown, unknown>[] = [
		new MathRendererPlugin(new PuppeteerMathRenderer()),
		new MermaidRendererPlugin(
			new PuppeteerMermaidRenderer(
				{ protocolTimeout: settings.mermaidProtocolTimeout },
				settings.mermaid,
			),
		),
	];

	if (settings.kroki?.enabled)
		plugins.push(new KrokiRendererPlugin(new HttpKrokiRenderer(settings.kroki)));
	if (settings.plantuml.enabled) {
		if (!settings.plantuml.serverUrl) {
			throw new Error(
				"PlantUML rendering is enabled but plantuml.serverUrl is empty. Set CONFLUENCE_PLANTUML_SERVER_URL, --plantumlServerUrl, or plantuml.serverUrl in .markdown-confluence.json — or set plantuml.enabled to false.",
			);
		}
		plugins.push(
			new PlantumlRendererPlugin(
				new HttpPlantumlRenderer({ serverUrl: settings.plantuml.serverUrl }),
			),
		);
	}

	const publisher = new Publisher(settings, confluenceClient, plugins, (message) => {
		console.error(`[publish] ${message}`);
	});

	const publishFilter = "";
	const results = yield* publisher.publishEffect(publishFilter) as any;

	if (destination) {
		const json = JSON.stringify(publishingReport(results), null, 2) + "\n";
		if (destination === "-") yield* Console.log(json);
		else {
			const fs = yield* FileSystem;
			yield* fs.writeFileString(destination, json);
		}
	}

	for (const file of results) {
		if (file.successfulUploadResult) {
			yield* (destination === "-" ? Console.error : Console.log)(
				chalk.green(
					`SUCCESS: ${file.node.file.absoluteFilePath} Content: ${file.successfulUploadResult.contentResult}, Images: ${file.successfulUploadResult.imageResult}, Labels: ${file.successfulUploadResult.labelResult}, Page URL: ${file.node.file.pageUrl}`,
				),
			) as any;
			continue;
		}
		yield* Console.error(
			chalk.red(
				`FAILED:  ${file.node.file.absoluteFilePath} publish failed. Error is: ${file.reason}`,
			),
		) as any;
	}
	if (
		results.some((file: { successfulUploadResult?: unknown }) => !file.successfulUploadResult)
	) {
		return yield* Effect.fail(new Error("One or more pages failed to publish"));
	}
});

const command = Effect.gen(function* () {
	const runtime = yield* RuntimeEnvironmentService;
	const argv = yield* runtime.argv;
	if (argv[2] === "validate" || argv[2] === "plan")
		return yield* preflight(argv[2], argv.slice(3));
	if (argv[2] === "to-adf" || argv[2] === "to-markdown" || argv[2] === "from-adf") {
		const conversion = argv[2] === "to-adf" ? "to-adf" : "to-markdown";
		return yield* convertDocument(conversion, argv.slice(3)).pipe(
			Effect.provide(StandardInputLive),
		);
	}
	if (argv[2] === "--help" || argv[2] === "-h") {
		return yield* Console.log(
			"Usage: markdown-confluence [publishing options]\n\nCommands:\n  validate     Validate selected Markdown without credentials\n  plan         Read-only Confluence page discovery\n  to-adf       Convert Markdown or export Confluence ADF\n  to-markdown  Convert ADF or a Confluence page to Markdown\n  from-adf     Alias for to-markdown\n\nUse COMMAND --help for conversion options. Without a command, publish using the configured settings.",
		);
	}
	return yield* program.pipe(
		Effect.provide(MarkdownWorkspaceLive),
		Effect.provide(ConfluenceSettingsLive),
	);
});

NodeRuntime.runMain(
	command.pipe(
		Effect.catch((error) =>
			Effect.gen(function* () {
				const runtimeEnvironment = yield* RuntimeEnvironmentService as any;
				yield* Console.error(
					chalk.red(boxen(`Error: ${getErrorMessage(error)}`, { padding: 1 })),
				) as any;
				return yield* runtimeEnvironment.exit(1) as any;
			}),
		),
		Effect.provide(MarkdownConfluencePlatformLive),
	) as Effect.Effect<void, never>,
);
