#!/usr/bin/env node

import { NodeRuntime } from "@effect/platform-node";
import chalk from "chalk";
import boxen from "boxen";
import { Console, Effect } from "effect";
import {
	ConfluenceSettingsLive,
	ConfluenceUploadSettings,
	MarkdownWorkspaceLive,
	MarkdownConfluencePlatformLive,
	Publisher,
	MermaidRendererPlugin,
	RuntimeEnvironmentService,
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
import { ConfluenceClient } from "confluence.js";

const program = Effect.gen(function* () {
	const runtimeEnvironment = yield* RuntimeEnvironmentService as any;
	yield* runtimeEnvironment.setMaxListeners(Infinity) as any;

	const settings = yield* ConfluenceUploadSettings.ConfluenceSettingsService as any;

	const confluenceClient = new ConfluenceClient({
		host: settings.confluenceBaseUrl,
		authentication: {
			basic: {
				email: settings.atlassianUserName,
				apiToken: settings.atlassianApiToken,
			},
		},
		middlewares: {
			onError(e) {
				if ("response" in e && "data" in e.response) {
					e.message =
						typeof e.response.data === "string"
							? e.response.data
							: JSON.stringify(e.response.data);
				}
			},
		},
	});

	const publisher = new Publisher(settings, confluenceClient, [
		new MermaidRendererPlugin(new PuppeteerMermaidRenderer()),
	]);

	const publishFilter = "";
	const results = yield* publisher.publishEffect(publishFilter) as any;

	for (const file of results) {
		if (file.successfulUploadResult) {
			yield* Console.log(
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
});

NodeRuntime.runMain(
	program.pipe(
		Effect.provide(MarkdownWorkspaceLive),
		Effect.provide(ConfluenceSettingsLive),
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

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : JSON.stringify(error);
}
