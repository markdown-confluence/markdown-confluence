import { parse } from "yaml";
import type { ADFEntity } from "@atlaskit/adf-utils/types";
import SparkMD5 from "spark-md5";

const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);
const paragraph = (value: unknown): ADFEntity => ({
	type: "paragraph",
	content: String(value ?? "") === "" ? [] : [{ type: "text", text: String(value) }],
});

/** Explicit YAML authoring; literal < and ^ are ordinary text, never destructive markers. */
export function yamlTable(source: string): ADFEntity {
	const data: unknown = parse(source, { maxAliasCount: 50 });
	let columns: string[];
	let rows: unknown[][];
	if (Array.isArray(data) && data.every(record)) {
		columns = [...new Set(data.flatMap((row) => Object.keys(row)))];
		rows = data.map((row) => columns.map((column) => row[column] ?? ""));
	} else if (
		record(data) &&
		Array.isArray(data["columns"]) &&
		data["columns"].every((value) => typeof value === "string") &&
		Array.isArray(data["rows"]) &&
		data["rows"].every(Array.isArray)
	) {
		columns = data["columns"];
		rows = data["rows"];
	} else throw new Error("yaml-table requires an array of records, or columns and rows arrays");
	if (!columns.length || !rows.length || columns.length > 100 || rows.length > 1000)
		throw new Error("yaml-table requires 1–100 columns and 1–1000 rows");
	const occupied = new Set<string>();
	const body = rows.map((row, rowIndex) => {
		let column = 0;
		const cells: ADFEntity[] = [];
		for (const input of row) {
			while (occupied.has(`${rowIndex}:${column}`)) column++;
			if (
				record(input) &&
				(!Object.hasOwn(input, "value") ||
					Object.keys(input).some(
						(key) => !["value", "rowspan", "colspan"].includes(key),
					))
			)
				throw new Error(
					"yaml-table structured cells require value and optional rowspan/colspan",
				);
			const cell = record(input) ? input : { value: input };
			const colspan = cell["colspan"] ?? 1;
			const rowspan = cell["rowspan"] ?? 1;
			if (
				typeof colspan !== "number" ||
				typeof rowspan !== "number" ||
				!Number.isInteger(colspan) ||
				!Number.isInteger(rowspan) ||
				colspan < 1 ||
				rowspan < 1 ||
				column + colspan > columns.length ||
				rowIndex + rowspan > rows.length
			)
				throw new Error("yaml-table cell span exceeds the table bounds");
			const value = cell["value"] ?? "";
			if (typeof value === "object") throw new Error("yaml-table cell values must be scalar");
			for (let down = 0; down < rowspan; down++)
				for (let across = 0; across < colspan; across++) {
					const key = `${rowIndex + down}:${column + across}`;
					if (occupied.has(key)) throw new Error("yaml-table contains overlapping spans");
					occupied.add(key);
				}
			cells.push({
				type: "tableCell",
				attrs: { colspan, rowspan },
				content: [paragraph(value)],
			});
			column += colspan;
		}
		for (let index = column; index < columns.length; index++)
			if (!occupied.has(`${rowIndex}:${index}`))
				cells.push({
					type: "tableCell",
					attrs: { colspan: 1, rowspan: 1 },
					content: [paragraph("")],
				});
		return { type: "tableRow", content: cells };
	});
	return {
		type: "table",
		attrs: { layout: "default" },
		content: [
			{
				type: "tableRow",
				content: columns.map((value) => ({
					type: "tableHeader",
					attrs: { colspan: 1, rowspan: 1 },
					content: [paragraph(value)],
				})),
			},
			...body,
		],
	};
}

export function structuredMarkdown(
	document: ADFEntity,
	parseMarkdown: (source: string, namespace: string) => ADFEntity,
	namespace: string,
): ADFEntity {
	let index = 0;
	const walk = (node: ADFEntity): ADFEntity => {
		if (node.type === "codeBlock") {
			const language = String(node.attrs?.["language"] ?? "");
			const source = (node.content ?? []).map((child) => child?.text ?? "").join("");
			if (language === "yaml-table" || language === "yaml table") return yamlTable(source);
			const macro = language.match(/^confluence-(excerpt|properties)(?:\s+(.+))?$/);
			if (macro) {
				const key = macro[1] === "excerpt" ? "excerpt" : "details";
				const name = macro[2]?.trim() ?? macro[1]!;
				const seed = `${namespace}:${key}:${name}:${index++}`;
				return {
					type: "bodiedExtension",
					attrs: {
						extensionType: "com.atlassian.confluence.macro.core",
						extensionKey: key,
						parameters: {
							macroParams: { [key === "excerpt" ? "name" : "id"]: { value: name } },
							macroMetadata: {
								macroId: { value: SparkMD5.hash(seed) },
								title: key === "excerpt" ? "Excerpt" : "Page Properties",
							},
						},
					},
					content: parseMarkdown(source, `${namespace}-${index}`).content ?? [],
				};
			}
		}
		if (node.content) node.content = node.content.map((child) => (child ? walk(child) : child));
		return node;
	};
	return walk(document);
}

export function jiraShorthand(document: ADFEntity, jiraUrl: string): void {
	const base = new URL(jiraUrl);
	if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
		throw new Error(
			"Jira URL must be an HTTPS site URL without credentials, query or fragment",
		);
	const walk = (node: ADFEntity) => {
		if (node.type === "codeBlock") return;
		if (!node.content) return;
		node.content = node.content.flatMap((child) => {
			if (!child) return [];
			if (
				child.type !== "text" ||
				!child.text ||
				child.marks?.some((mark) => mark.type === "code" || mark.type === "link")
			) {
				walk(child);
				return [child];
			}
			const result: ADFEntity[] = [];
			let end = 0;
			for (const match of child.text.matchAll(/\bJIRA:\s*([A-Z][A-Z0-9_]*-\d+)\b/g)) {
				if (match.index! > end)
					result.push({ ...child, text: child.text.slice(end, match.index) });
				result.push({
					type: "inlineCard",
					attrs: { url: `${base.href.replace(/\/$/, "")}/browse/${match[1]}` },
				});
				end = match.index! + match[0].length;
			}
			if (!end) return [child];
			if (end < child.text.length) result.push({ ...child, text: child.text.slice(end) });
			return result;
		});
	};
	walk(document);
}
