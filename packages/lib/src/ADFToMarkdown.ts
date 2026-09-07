import { readMathExpression } from "./ADFProcessingPlugins/MathRendererPlugin";
import { ADFEntity } from "@atlaskit/adf-utils/dist/types/types";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { fencedCode } from "./AdfDocument";
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
				const createADFCodeBlock = renderCodeBlock("adf", JSON.stringify(curr));
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
		return element.text ? escapeMarkdownText(element.text) : element.text;
	}

	let returnText = escapeMarkdownText(element.text);
	for (const mark of element.marks) {
		switch (mark.type) {
			case "strong":
				returnText = `**${returnText}**`;
				break;
			case "em":
				returnText = `*${returnText}*`;
				break;
			case "strike":
				returnText = `~~${returnText}~~`;
				break;
			case "code":
				returnText = renderInlineCode(element.text);
				break;
			case "subsup": {
				const subsupType = mark.attrs && mark.attrs["type"] ? mark.attrs["type"] : "sup";
				returnText = `<${subsupType}>${returnText}</${subsupType}>`;
				break;
			}
			case "link": {
				const linkHref = markdownDestination(mark.attrs?.["href"] ?? "#");
				returnText = `[${returnText}](${linkHref})`;
				break;
			}
			case "underline":
				returnText = `<u>${returnText}</u>`;
				break;
			case "textColor":
			case "backgroundColor": {
				const color = mark.attrs?.["color"];
				if (typeof color !== "string" || !/^#[\da-f]{3,8}$/i.test(color))
					return new Error("Unsupported color");
				const property = mark.type === "textColor" ? "color" : "background-color";
				returnText = `<span style="${property}: ${color}">${returnText}</span>`;
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
	if (
		element.type !== "text" &&
		element.marks?.length &&
		!(
			parent.type.startsWith("table") &&
			element.marks.every((mark) => mark.type === "alignment")
		)
	)
		return new Error("Block marks require ADF preservation");
	if (element.type === "codeBlock")
		return renderCodeBlock(
			element.attrs?.["language"] ?? "",
			(element.content ?? []).map((child) => child?.text ?? "").join(""),
		);
	const renderChildrenResult = renderChildren(element);
	if (renderChildrenResult instanceof Error) {
		return renderChildrenResult;
	}

	const math = readMathExpression(element);
	if (math) return math.display ? `$$\n${math.source}\n$$` : `$${math.source}$`;
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
				element.attrs && element.attrs["level"] ? parseInt(element.attrs["level"]) : 1;
			const beforeText = "#".repeat(headingLevel);
			return beforeText + " " + renderChildrenResult;
		}
		case "taskList":
		case "bulletList":
		case "orderedList": {
			return renderChildrenResult;
		}
		case "decisionList": {
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
						parent.attrs && parent.attrs["order"] ? parseInt(parent.attrs["order"]) : 1;
					prefix = `${orderAttr + currentIndex}. `;
					break;
				}
				default:
					return new Error("Unhandled listItem parent");
			}
			return (
				prefix +
				renderChildrenResult.trimEnd().replace(/\n/g, `\n${" ".repeat(prefix.length)}`) +
				"\n"
			);
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
				element.attrs && element.attrs["panelType"] ? element.attrs["panelType"] : "info";
			const result = renderChildrenResult
				.split("\n")
				.map((line) => (line ? `> ${line}\n` : line))
				.join("");

			const headerRow = `> [!${panelType}]\n`;
			return headerRow + result;
		}
		case "nestedExpand":
		case "expand": {
			const title = element.attrs && element.attrs["title"] ? element.attrs["title"] : "info";
			const result = renderChildrenResult
				.split("\n")
				.map((line) => (line ? `> ${line}\n` : line))
				.join("");

			const headerRow = `> [!expand]+ ${title}\n`;
			return headerRow + result;
		}
		case "mention": {
			const userId = element.attrs && element.attrs["id"] ? element.attrs["id"] : undefined;
			const text = element.attrs && element.attrs["text"] ? element.attrs["text"] : undefined;
			return `[[mention:${userId}|${text}]]`;
		}
		case "taskItem": {
			const taskState =
				element.attrs && element.attrs["state"] ? element.attrs["state"] : "TODO";
			const taskStateMarkdown = taskState === "TODO" ? " " : "x";
			return `- [${taskStateMarkdown}] ${renderChildrenResult}\n`;
		}
		case "decisionItem": {
			return `- ${renderChildrenResult.trimEnd()}\n`;
		}
		case "date": {
			const timestamp = element.attrs && element.attrs["timestamp"];
			return renderDate(timestamp);
		}
		case "emoji": {
			const emojiId = element.attrs && element.attrs["id"] ? element.attrs["id"] : undefined;

			let shortName =
				element.attrs &&
				element.attrs["shortName"] &&
				typeof element.attrs["shortName"] === "string"
					? element.attrs["shortName"]
					: "";

			if (shortName) {
				shortName = `|${shortName.replaceAll(":", "")}`;
			}

			return emojiId
				? `:${emojiId}${shortName}:`
				: (element.attrs?.["text"] ?? element.attrs?.["shortName"] ?? "");
		}
		case "blockCard":
		case "embedCard":
		case "inlineCard": {
			const inlineCardUrl =
				element.attrs && element.attrs["url"] ? element.attrs["url"] : undefined;
			if (typeof inlineCardUrl !== "string")
				return new Error("Card data requires ADF preservation");
			return `[${escapeMarkdownText(inlineCardUrl)}](${markdownDestination(inlineCardUrl)})`;
		}
		case "status":
			return `**${escapeMarkdownText(String(element.attrs?.["text"] ?? ""))}**`;
		case "placeholder":
			return escapeMarkdownText(String(element.attrs?.["text"] ?? ""));
		case "caption":
			return renderChildrenResult;
		case "mediaSingle":
		case "mediaGroup":
			return (element.content ?? [])
				.map((child, index) => renderADFContent(child!, element, index))
				.join("\n\n");
		case "media":
		case "mediaInline":
		case "image": {
			const url = element.attrs?.["url"] ?? element.attrs?.["src"];
			if (typeof url !== "string" || !url)
				return new Error("Media IDs require ADF preservation");
			const alt = escapeMarkdownText(String(element.attrs?.["alt"] ?? ""));
			return `![${alt}](${markdownDestination(url.replace(/^file:\/\//, ""))})`;
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
			return new Error(`Unknown ADFEntity Type ${element.type}`);
	}
}

function renderTable(element: ADFEntity) {
	if (!element.content) {
		return "";
	}

	const tableCells: string[][] = [];

	const alignments: ("left" | "right" | "center" | null)[] = [];
	for (const tableRow of element.content) {
		if (!tableRow || !tableRow.content) {
			continue;
		}

		const rowCells: string[] = [];
		for (const [column, tableCell] of tableRow.content.entries()) {
			if (!tableCell || !tableCell.content) {
				continue;
			}
			if (
				(tableCell.attrs?.["colspan"] ?? 1) !== 1 ||
				(tableCell.attrs?.["rowspan"] ?? 1) !== 1
			)
				return new Error("Merged cells require ADF preservation");
			const alignment = tableCell.content[0]?.marks?.find((mark) => mark.type === "alignment")
				?.attrs?.["align"];
			const markdownAlignment =
				alignment === "end"
					? "right"
					: alignment === "center"
						? "center"
						: alignment === "start"
							? "left"
							: null;
			if (alignments[column] !== undefined && alignments[column] !== markdownAlignment)
				return new Error("Mixed column alignment requires ADF preservation");
			alignments[column] = markdownAlignment;
			const cellContent = renderChildren(tableCell);
			if (typeof cellContent === "string") {
				// Text is escaped before adding Markdown marks. Re-escaping the rendered
				// cell would change backslashes and pipes inside inline code and links.
				rowCells.push(cellContent.replace(/\n/g, "<br>"));
			}
		}
		tableCells.push(rowCells);
	}

	return markdownTable(tableCells, { align: alignments });
}

function renderCodeBlock(language: string, code: string) {
	return fencedCode(language, code);
}

function renderDate(timestamp: unknown) {
	if (typeof timestamp === "string" && timestamp.trim() === "") return "";
	const timestampNumber =
		typeof timestamp === "string" || typeof timestamp === "number" ? Number(timestamp) : NaN;
	if (!Number.isFinite(timestampNumber)) {
		return "";
	}

	const date = new Date(timestampNumber);
	return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
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

function escapeMarkdownText(text: string): string {
	return text.replace(/([\\`*_[\]<>~|])/g, "\\$1");
}

function markdownDestination(value: unknown): string {
	return String(value).replace(/[\s<>()[\]\\|]/g, (character) =>
		encodeURIComponent(character).replaceAll("(", "%28").replaceAll(")", "%29"),
	);
}

function renderInlineCode(text: string): string {
	const marker = "`".repeat(
		Math.max(1, ...(text.match(/`+/g) ?? []).map((run) => run.length + 1)),
	);
	const padding = /^[` ]|[` ]$/.test(text) ? " " : "";
	return `${marker}${padding}${text}${padding}${marker}`;
}
