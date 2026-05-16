import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type MarkdownFrontmatter = {
	data: Record<string, unknown>;
	content: string;
};

const delimiterPattern = /(?:^|\r?\n)---[ \t]*(?:\r?\n|$)/;

export function parseMarkdownFrontmatter(fileContent: string): MarkdownFrontmatter {
	const openingDelimiter = /^---[ \t]*(?:\r?\n|$)/.exec(fileContent);
	if (!openingDelimiter) {
		return { data: {}, content: fileContent };
	}

	const frontmatterStart = openingDelimiter[0].length;
	const remainingContent = fileContent.slice(frontmatterStart);
	const closingDelimiter = delimiterPattern.exec(remainingContent);

	const frontmatterContent = closingDelimiter
		? remainingContent.slice(0, closingDelimiter.index)
		: remainingContent;
	const content = closingDelimiter
		? remainingContent.slice(closingDelimiter.index + closingDelimiter[0].length)
		: "";

	return {
		data: parseFrontmatterData(frontmatterContent),
		content,
	};
}

export function stringifyMarkdownFrontmatter(
	fileContent: MarkdownFrontmatter,
	data: Record<string, unknown>,
): string {
	const updatedData = { ...fileContent.data, ...data };
	const frontmatter = stringifyYaml(updatedData).trim();
	const content = fileContent.content.endsWith("\n")
		? fileContent.content
		: `${fileContent.content}\n`;

	if (!frontmatter || frontmatter === "{}") {
		return content;
	}

	return `---\n${frontmatter}\n---\n${content}`;
}

function parseFrontmatterData(frontmatterContent: string): Record<string, unknown> {
	if (frontmatterContent.replace(/^\s*#[^\n]+/gm, "").trim() === "") {
		return {};
	}

	const parsedData: unknown = parseYaml(frontmatterContent);
	if (parsedData && typeof parsedData === "object" && !Array.isArray(parsedData)) {
		return parsedData as Record<string, unknown>;
	}

	return {};
}
