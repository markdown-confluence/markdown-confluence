#!/usr/bin/env node

import { NodeRuntime } from "@effect/platform-node";
import chalk from "chalk";
import boxen from "boxen";
import { Cause, Console, Effect } from "effect";
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
	const message = formatUnknownError(error, new WeakSet());
	return message.trim().length > 0 ? message : "Unknown error";
}

function formatUnknownError(error: unknown, seenErrors: WeakSet<object>): string {
	if (Cause.isCause(error)) {
		return Cause.pretty(error);
	}

	if (error instanceof Error) {
		const errorMessage = error.message.trim();
		const message = errorMessage.length > 0 ? errorMessage : error.stack || error.name;
		const causeMessage = formatErrorCause(error.cause, seenErrors);
		return joinMessages([message, causeMessage]);
	}

	if (typeof error === "string") {
		return error;
	}

	if (error === null) {
		return "null";
	}

	if (error === undefined) {
		return "undefined";
	}

	if (typeof error === "object") {
		if (seenErrors.has(error)) {
			return "[Circular error]";
		}
		seenErrors.add(error);

		const message = getStringProperty(error, "message");
		const causeMessage = formatErrorCause(getObjectProperty(error, "cause"), seenErrors);
		const serializedError = stringifyObject(error);
		return joinMessages([message, serializedError, causeMessage]);
	}

	return String(error);
}

function formatErrorCause(cause: unknown, seenErrors: WeakSet<object>): string {
	if (cause === undefined) {
		return "";
	}

	return `Caused by: ${formatUnknownError(cause, seenErrors)}`;
}

function getObjectProperty(source: object, propertyName: string): unknown {
	return propertyName in source ? (source as Record<string, unknown>)[propertyName] : undefined;
}

function getStringProperty(source: object, propertyName: string): string {
	const propertyValue = getObjectProperty(source, propertyName);
	return typeof propertyValue === "string" ? propertyValue : "";
}

function stringifyObject(source: object): string {
	try {
		const serializedError = JSON.stringify(source, null, 2);
		return serializedError && serializedError !== "{}" ? serializedError : "";
	} catch {
		return "";
	}
}

function joinMessages(messages: string[]): string {
	return messages.filter((message) => message.trim().length > 0).join("\n");
}
