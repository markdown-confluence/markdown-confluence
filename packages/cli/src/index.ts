#!/usr/bin/env node

process.setMaxListeners(Infinity);

import chalk from "chalk";
import boxen from "boxen";
import {
	AutoSettingsLoader,
	FileSystemAdaptor,
	Publisher,
	MermaidRendererPlugin,
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
import { ConfluenceClient } from "confluence.js";

// Define the main function
async function main() {
	let authentication;
	const settingLoader = new AutoSettingsLoader();
	const settings = settingLoader.load();

	const adaptor = new FileSystemAdaptor(settings); // Make sure this is identical as possible between Obsidian and CLI
	switch (settings.confluenceAuthMethod) {
		case "oauth2":
			authentication = {
				oauth2: {
					accessToken: settings.atlassianApiToken,
				},
			};
			break;
		case "token":
			authentication = {
				personalAccessToken: settings.atlassianApiToken,
			};
			break;
		case "basic":
			authentication = {
				email: settings.atlassianUsername,
				apiToken: settings.atlassianApiToken,
			};
			break;
		default:
			throw new Error(
				`Unknown authentication method: ${settings.confluenceAuthMethod}`,
			);
	}
	const confluenceClient = new ConfluenceClient({
		host: settings.confluenceBaseUrl,
		authentication,
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

	const publisher = new Publisher(adaptor, settingLoader, confluenceClient, [
		new MermaidRendererPlugin(new PuppeteerMermaidRenderer()),
	]);

	const publishFilter = "";
	const results = await publisher.publish(publishFilter);
	results.forEach((file) => {
		if (file.successfulUploadResult) {
			console.log(
				chalk.green(
					`SUCCESS: ${file.node.file.absoluteFilePath} Content: ${file.successfulUploadResult.contentResult}, Images: ${file.successfulUploadResult.imageResult}, Labels: ${file.successfulUploadResult.labelResult}, Page URL: ${file.node.file.pageUrl}`,
				),
			);
			return;
		}
		console.error(
			chalk.red(
				`FAILED:  ${file.node.file.absoluteFilePath} publish failed. Error is: ${file.reason}`,
			),
		);
	});
}

// Call the main function
main().catch((error) => {
	console.error(chalk.red(boxen(`Error: ${error.message}`, { padding: 1 })));
	process.exit(1);
});
