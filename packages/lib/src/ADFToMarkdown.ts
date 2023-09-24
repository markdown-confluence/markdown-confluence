import { ADFEntity } from "@atlaskit/adf-utils/dist/types/types";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { markdownTable } from "markdown-table";

export function renderADFDoc(adfDoc: JSONDocNode) {
	const lines = (adfDoc.content ?? []).reduce(
		(prev, curr, currentIndex) => {
			if (!curr) {
				return prev;
			}
			const result = renderADFContent(curr, adfDoc, currentIndex);
			if (!result) {
				return prev;
			}
			if (result instanceof Error) {
				const createADFCodeBlock = renderCodeBlock(
					"adf",
					JSON.stringify(curr),
				);
				return [...prev, createADFCodeBlock];
			}
			return [...prev, result];
		},
		[] as (string | Error)[],
	);
	const result = lines.join("\n");
	return result;
}

function renderTextMarks(element: ADFEntity) {
	if (!element.marks || !element.text) {
		return element.text;
	}

	let returnText = element.text;
	for (const mark of element.marks) {
		switch (mark.type) {
			case "strong":
				returnText = `**${returnText}**`;
				break;
			case "em":
				returnText = `*${returnText}*`;
				break;
			case "strike":
				returnText = `~${returnText}~`;
				break;
			case "code":
				returnText = `\`${returnText}\``;
				break;
			case "subsup": {
				const subsupType =
					mark.attrs && mark.attrs["type"]
						? mark.attrs["type"]
						: "sup";
				returnText = `<${subsupType}>${returnText}</${subsupType}>`;
				break;
			}
			case "link": {
				const linkHref =
					mark.attrs && mark.attrs["href"] ? mark.attrs["href"] : "#";
				returnText = `[${returnText}](${linkHref})`;
				break;
			}
			default:
				return new Error(`Unknown Mark ${mark.type}`);
		}
	}
	return returnText;
}

function renderADFContent(
	element: ADFEntity,
	parent: ADFEntity,
	currentIndex: number,
): string | Error | undefined {
	const renderChildrenResult = renderChildren(element);
	if (renderChildrenResult instanceof Error) {
		return renderChildrenResult;
	}

	switch (element.type) {
		case "doc": {
			return new Error("Call renderADFDoc");
		}
		case "paragraph": {
			if (parent.type.startsWith("table")) {
				return renderChildrenResult;
			}
			return renderChildrenResult + "\n";
		}
		case "text": {
			return renderTextMarks(element);
		}
		case "hardBreak": {
			return "\n";
		}
		case "rule": {
			return "\n---\n";
		}
		case "heading": {
			const headingLevel =
				element.attrs && element.attrs["level"]
					? parseInt(element.attrs["level"])
					: 1;
			const beforeText = "#".repeat(headingLevel);
			return beforeText + " " + renderChildrenResult;
		}
		case "codeBlock": {
			const language =
				element.attrs && element.attrs["language"]
					? element.attrs["language"]
					: "";
			return renderCodeBlock(language, renderChildrenResult);
		}
		case "taskList":
		case "bulletList":
		case "orderedList": {
			return renderChildrenResult;
		}
		case "listItem": {
			let prefix = "- ";
			switch (parent.type) {
				case "bulletList":
					prefix = "- ";
					break;
				case "orderedList": {
					const orderAttr =
						element.attrs && element.attrs["order"]
							? parseInt(element.attrs["order"])
							: 1;
					prefix = `${orderAttr + currentIndex}. `;
					break;
				}
				default:
					return new Error("Unhandled listItem parent");
			}
			return prefix + renderChildrenResult;
		}
		case "blockquote": {
			const result = renderChildrenResult
				.split("\n")
				.map((line) => (line ? `> ${line}\n` : line))
				.join("");

			return result;
		}
		case "panel": {
			const panelType =
				element.attrs && element.attrs["panelType"]
					? element.attrs["panelType"]
					: "info";
			const result = renderChildrenResult
				.split("\n")
				.map((line) => (line ? `> ${line}\n` : line))
				.join("");

			const headerRow = `> [!${panelType}]\n`;
			return headerRow + result;
		}
		case "expand": {
			const title =
				element.attrs && element.attrs["title"]
					? element.attrs["title"]
					: "info";
			const result = renderChildrenResult
				.split("\n")
				.map((line) => (line ? `> ${line}\n` : line))
				.join("");

			const headerRow = `> [!expand]+ ${title}\n`;
			return headerRow + result;
		}
		case "mention": {
			const userId =
				element.attrs && element.attrs["id"]
					? element.attrs["id"]
					: undefined;
			const text =
				element.attrs && element.attrs["text"]
					? element.attrs["text"]
					: undefined;
			return `[[mention:${userId}|${text}]]`;
		}
		case "taskItem": {
			const taskState =
				element.attrs && element.attrs["state"]
					? element.attrs["state"]
					: "TODO";
			const taskStateMarkdown = taskState === "TODO" ? " " : "x";
			return `- [${taskStateMarkdown}] ${renderChildrenResult}\n`;
		}
		case "emoji": {
			const emojiId =
				element.attrs && element.attrs["id"]
					? element.attrs["id"]
					: undefined;

			let shortName =
				element.attrs &&
				element.attrs["shortName"] &&
				typeof element.attrs["shortName"] === "string"
					? element.attrs["shortName"]
					: "";

			if (shortName) {
				shortName = `|${shortName.replaceAll(":", "")}`;
			}

			return `:${emojiId}${shortName}:`;
		}
		case "inlineCard": {
			const inlineCardUrl =
				element.attrs && element.attrs["url"]
					? element.attrs["url"]
					: undefined;
			return `[${inlineCardUrl}](${inlineCardUrl})`;
		}
		case "table": {
			return renderTable(element);
		}
		case "tableHeader":
		case "tableRow":
		case "tableCell": {
			return renderChildrenResult;
		}
		default:
			console.warn(`Unknown ADFEntity Type ${element.type}`);
			return new Error(`Unknown ADFEntity Type ${element.type}`);
	}
}

function renderTable(element: ADFEntity) {
	if (!element.content) {
		return "";
	}

	const tableCells: string[][] = [];

	// TODO: Handle alignment
	for (const tableRow of element.content) {
		if (!tableRow || !tableRow.content) {
			continue;
		}

		const rowCells: string[] = [];
		for (const tableCell of tableRow.content) {
			if (!tableCell || !tableCell.content) {
				continue;
			}
			const cellContent = renderChildren(tableCell);
			if (typeof cellContent === "string") {
				rowCells.push(cellContent);
			}
		}
		tableCells.push(rowCells);
	}

	return markdownTable(tableCells);
}

function renderCodeBlock(language: string, code: string) {
	return `\`\`\`${language} \n${code}\n\`\`\``;
}

function renderChildren(element: ADFEntity) {
	const lines = (element.content ?? []).reduce(
		(prev, curr, currentIndex) => {
			if (!curr || prev[0] instanceof Error) {
				return prev;
			}
			const result = renderADFContent(curr, element, currentIndex);
			if (!result) {
				return prev;
			}
			if (result instanceof Error) {
				return [result];
			}
			return [...prev, result];
		},
		[] as (string | Error)[],
	);
	const firstResult = lines.at(0);
	if (firstResult instanceof Error) {
		return firstResult;
	}
	const result = lines.join("");
	return result;
}
