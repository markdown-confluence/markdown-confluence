#!/usr/bin/env node

process.setMaxListeners(Infinity);

import chalk from "chalk";
import boxen from "boxen";
import {
	ConfluenceUploadSettings,
	FileSystemAdaptor,
	Publisher,
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
import { ConfluenceClient } from "confluence.js";

// Define the main function
async function main() {
	const settingLoader = new ConfluenceUploadSettings.AutoSettingsLoader();
	const settings = settingLoader.load();

	const adaptor = new FileSystemAdaptor(
		settings,
		"/Users/andrewmcclenaghan/dev/obsidian-confluence/obsidian-confluence/dev-vault/"
	); // Make sure this is identical as possible between Obsidian and CLI
	const mermaidRenderer = new PuppeteerMermaidRenderer();
	const confluenceClient = new ConfluenceClient({
		host: settings.confluenceBaseUrl,
		authentication: {
			basic: {
				email: settings.atlassianUserName,
				apiToken: settings.atlassianApiToken,
			},
		},
	});

	const publisher = new Publisher(
		adaptor,
		settingLoader,
		confluenceClient,
		mermaidRenderer
	);

	const publishFilter = "";
	publisher.doPublish(publishFilter);
}

// Call the main function
main().catch((error) => {
	console.error(chalk.red(boxen(`Error: ${error.message}`, { padding: 1 })));
	process.exit(1);
});
