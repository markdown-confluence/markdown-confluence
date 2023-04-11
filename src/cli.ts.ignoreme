/* eslint-disable */

/*
Error.stackTraceLimit = Infinity;

import * as fs from "fs";
import * as path from "path";
import MdToADF from "./mdToADF";

const mdToADFConverter = new MdToADF();

function loadMarkdownFiles(folderPath: string): string[] {
	const files: string[] = [];
	const entries = fs.readdirSync(folderPath, { withFileTypes: true });

	for (const entry of entries) {
		const entryPath = path.join(folderPath, entry.name);

		if (entry.isFile() && path.extname(entry.name) === ".md") {
			const fileContent = fs.readFileSync(entryPath, "utf-8");
			files.push(entryPath);
		} else if (entry.isDirectory()) {
			const subFiles = loadMarkdownFiles(entryPath);
			files.push(...subFiles);
		}
	}

	return files;
}

const mdFiles = loadMarkdownFiles(
	"/Users/amcclenaghan/pdev/andymac4182/obsidian-confluence/dev-vault/"
);

for (const filename of mdFiles) {
	const md = fs.readFileSync(filename, "utf8");
	const adf = mdToADFConverter.parse(md);
	const adfString = JSON.stringify(adf, null, 2);
	console.log(adfString);
	fs.writeFileSync(filename.replace(".md", ".adf"), adfString, {
		encoding: "utf8",
		flag: "w",
	});
}
*/
