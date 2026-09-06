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
	createAuthenticatedConfluenceClient,
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
import { getErrorMessage } from "./errorMessage";

const program = Effect.gen(function* () {
	const runtimeEnvironment = yield* RuntimeEnvironmentService as any;
	yield* runtimeEnvironment.setMaxListeners(Infinity) as any;

	const settings = yield* ConfluenceUploadSettings.ConfluenceSettingsService as any;

	const confluenceClient = yield* createAuthenticatedConfluenceClient(settings);

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
	if (
		results.some((file: { successfulUploadResult?: unknown }) => !file.successfulUploadResult)
	) {
		return yield* Effect.fail(new Error("One or more pages failed to publish"));
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
