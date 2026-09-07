export type ConversionOptions = {
	input?: string;
	page?: string;
	output?: string;
	config?: string;
	baseUrl: string;
	lossless: boolean;
	help: boolean;
};

export function parseConversionOptions(
	args: string[],
	command: "to-adf" | "to-markdown",
): ConversionOptions {
	const options: ConversionOptions = {
		baseUrl: "https://confluence.atlassian.com",
		lossless: true,
		help: false,
	};
	for (let index = 0; index < args.length; index++) {
		const argument = args[index]!;
		if (argument === "--help" || argument === "-h") {
			options.help = true;
			continue;
		}
		if (argument === "--readable" || argument === "--lossless") {
			if (command !== "to-markdown")
				throw new Error(`${argument} is only supported by to-markdown.`);
			options.lossless = argument === "--lossless";
			continue;
		}
		if (argument === "--") {
			for (const input of args.slice(index + 1)) setInput(options, input);
			break;
		}
		if (argument === "-" || !argument.startsWith("-")) {
			setInput(options, argument);
			continue;
		}
		const separator = argument.indexOf("=");
		const option = separator === -1 ? argument : argument.slice(0, separator);
		const field = (
			{
				"-i": "input",
				"--input": "input",
				"-o": "output",
				"--output": "output",
				"-b": "baseUrl",
				"--base-url": "baseUrl",
				"--page": "page",
				"-c": "config",
				"--config": "config",
			} as Record<string, "input" | "output" | "baseUrl" | "page" | "config">
		)[option];
		if (!field) throw new Error(`Unknown ${command} option: ${option}`);
		const value = separator === -1 ? args[++index] : argument.slice(separator + 1);
		if (!value || (value.startsWith("-") && value !== "-"))
			throw new Error(`${option} requires a value.`);
		if (field === "input") setInput(options, value);
		else options[field] = value;
	}
	if (options.input && options.page)
		throw new Error("Use either an input file/URL or --page, not both.");
	if (options.input && /^https?:\/\//i.test(options.input)) {
		options.page = options.input;
		delete options.input;
	}
	return options;
}

function setInput(options: ConversionOptions, input: string): void {
	if (options.input !== undefined)
		throw new Error("Only one input file or Confluence URL can be converted at a time.");
	options.input = input;
}

export function conversionHelp(command: "to-adf" | "to-markdown"): string {
	return `Usage: markdown-confluence ${command} [FILE | CONFLUENCE_URL | -] [options]

${command === "to-adf" ? "Convert Markdown to ADF JSON, or export a Confluence page's ADF." : "Convert ADF JSON or a Confluence page to Markdown."}
Omit the input (or use -) to read stdin. Local conversion needs no credentials.

  -i, --input FILE       Input file (also accepts a Confluence page URL)
  --page ID_OR_URL       Read a Confluence page using the configured authentication
  -o, --output FILE      Write to FILE; defaults to stdout (-)
  -b, --base-url URL     Base URL used when converting local Markdown links
  -c, --config FILE      Existing Confluence config (or CONFLUENCE_CONFIG_FILE)
${command === "to-markdown" ? "  --lossless            Preserve exact ADF using existing adf fences (default)\n  --readable            Prefer readable Markdown; presentation metadata may be lost\n" : ""}  -h, --help            Show this help

Confluence reads use the existing config/environment authentication settings.
No parent page ID is required. These commands do not publish or modify pages.`;
}
