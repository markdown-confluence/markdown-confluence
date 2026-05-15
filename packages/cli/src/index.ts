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
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Define the main function
async function main() {
	if (process.argv[2] === "to-adf") {
		await markdownToAdf();
		return;
	}

	const settingLoader = new AutoSettingsLoader();
	const settings = settingLoader.load();

	const adaptor = new FileSystemAdaptor(settings); // Make sure this is identical as possible between Obsidian and CLI
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

async function markdownToAdf() {
	const options = parseToAdfOptions(process.argv.slice(3));
	const markdown = options.input
		? readMarkdownFile(options.input)
		: await readStdin();
	const adf = parseMarkdownToADF(markdown, options.baseUrl);
	const output = `${JSON.stringify(adf, null, 2)}\n`;

	if (options.output) {
		writeFileSync(resolve(options.output), output, "utf-8");
		return;
	}

	process.stdout.write(output);
}

type ToAdfOptions = {
	input?: string;
	output?: string;
	baseUrl: string;
};

function parseToAdfOptions(args: string[]): ToAdfOptions {
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
			options.output = arg.slice("--output=".length);
			continue;
		}

		if (arg === "-b" || arg === "--base-url") {
			options.baseUrl = requireOptionValue(arg, args[++index]);
			continue;
		}

		if (arg.startsWith("--base-url=")) {
			options.baseUrl = arg.slice("--base-url=".length);
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
	if (!value) {
		throw new Error(`${option} requires a value.`);
	}

	return value;
}

function readMarkdownFile(input: string) {
	const filePath = resolve(input);

	if (!existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	return readFileSync(filePath, "utf-8");
}

async function readStdin() {
	if (process.stdin.isTTY) {
		throw new Error("Input file is required when stdin is not piped.");
	}

	process.stdin.setEncoding("utf-8");
	let input = "";

	for await (const chunk of process.stdin) {
		input += chunk;
	}

	return input;
}
