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
import { dispatchCommand } from "./command";
import { FileSystem } from "effect/FileSystem";
import { publishingReport } from "@markdown-confluence/lib";
import { convertDocument } from "./convert";
import { HttpPlantumlRenderer } from "@markdown-confluence/plantuml-renderer";

const program = (destination?: string) =>
	Effect.gen(function* () {
		const runtimeEnvironment = yield* RuntimeEnvironmentService as any;
		yield* runtimeEnvironment.setMaxListeners(Infinity) as any;

		const settings = yield* ConfluenceUploadSettings.ConfluenceSettingsService as any;

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
			results.some(
				(file: { successfulUploadResult?: unknown }) => !file.successfulUploadResult,
			)
		) {
			return yield* Effect.fail(new Error("One or more pages failed to publish"));
		}
	});

const command = dispatchCommand({
	publish: (report) =>
		program(report).pipe(
			Effect.provide(MarkdownWorkspaceLive),
			Effect.provide(ConfluenceSettingsLive),
		),
	preflight,
	convert: (conversion, args) =>
		convertDocument(conversion, args).pipe(Effect.provide(StandardInputLive)),
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
