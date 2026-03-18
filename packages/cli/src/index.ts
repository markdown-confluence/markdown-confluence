#!/usr/bin/env node

process.setMaxListeners(Infinity);

import chalk from "chalk";
import boxen from "boxen";
import {
	AutoSettingsLoader,
	FileSystemAdaptor,
	Publisher,
	MermaidRendererPlugin,
	parseMarkdownToADF,
} from "@markdown-confluence/lib";
import { PuppeteerMermaidRenderer } from "@markdown-confluence/mermaid-puppeteer-renderer";
import { ConfluenceClient } from "confluence.js";
import * as fs from "fs";
import * as path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const subcommand = process.argv[2];

if (subcommand === "to-adf") {
	// Handle the to-adf subcommand
	yargs(hideBin(process.argv))
		.command(
			"to-adf [input]",
			"Convert a Markdown file (or stdin) to Atlassian Document Format (ADF) JSON",
			(yargs) => {
				return yargs
					.positional("input", {
						describe:
							"Path to the Markdown file to convert. Reads from stdin if omitted.",
						type: "string",
					})
					.option("output", {
						alias: "o",
						describe:
							"Write ADF JSON to this file instead of stdout",
						type: "string",
					})
					.option("base-url", {
						alias: "b",
						describe:
							"Confluence base URL (used for resolving Confluence links)",
						type: "string",
						default: "https://confluence.atlassian.com",
					});
			},
			async (args) => {
				let markdown: string;

				if (args.input) {
					const filePath = path.resolve(args.input as string);
					if (!fs.existsSync(filePath)) {
						console.error(
							chalk.red(`Error: File not found: ${filePath}`),
						);
						process.exit(1);
					}
					markdown = fs.readFileSync(filePath, "utf-8");
				} else {
					// Read from stdin
					markdown = fs.readFileSync("/dev/stdin", "utf-8");
				}

				const baseUrl = args["base-url"] as string;

				try {
					const adf = parseMarkdownToADF(markdown, baseUrl);
					const adfJson = JSON.stringify(adf, null, 2);

					if (args.output) {
						const outPath = path.resolve(args.output as string);
						fs.writeFileSync(outPath, adfJson, "utf-8");
						console.error(
							chalk.green(`ADF written to: ${outPath}`),
						);
					} else {
						process.stdout.write(adfJson + "\n");
					}
				} catch (error: unknown) {
					const message =
						error instanceof Error ? error.message : String(error);
					console.error(
						chalk.red(
							boxen(`Conversion error: ${message}`, {
								padding: 1,
							}),
						),
					);
					process.exit(1);
				}
			},
		)
		.help()
		.parse();
} else {
	publishToConfluence();
}

async function publishToConfluence() {
	try {
		const settingLoader = new AutoSettingsLoader();
		const settings = settingLoader.load();

		const adaptor = new FileSystemAdaptor(settings);
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

		const publisher = new Publisher(
			adaptor,
			settingLoader,
			confluenceClient,
			[new MermaidRendererPlugin(new PuppeteerMermaidRenderer())],
		);

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
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(chalk.red(boxen(`Error: ${message}`, { padding: 1 })));
		process.exit(1);
	}
}
