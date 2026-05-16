#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const skippedDirectoryNames = new Set([
	".git",
	".husky",
	"coverage",
	"dev-vault",
	"dist",
	"node_modules",
]);
const blockedTerms = new Set([
	"util",
	"utils",
	"helper",
	"helpers",
	"common",
	"shared",
	"misc",
	"miscellaneous",
	"generic",
]);

const standardRepeatedFileNames = new Set([
	"changelog.md",
	"package.json",
	"readme.md",
	"tsconfig.json",
	"vite.config.ts",
]);

const allowedRepeatedFilePaths = new Set([
	"packages/cli/src/index.ts",
	"packages/lib/src/ADFProcessingPlugins/index.ts",
	"packages/lib/src/MarkdownTransformer/index.ts",
	"packages/lib/src/SettingsLoader/index.ts",
	"packages/lib/src/adaptors/index.ts",
	"packages/lib/src/index.ts",
	"packages/mermaid-electron-renderer/src/index.ts",
	"packages/mermaid-puppeteer-renderer/src/index.ts",
	"packages/obsidian/src/custom.d.ts",
	"packages/lib/src/custom.d.ts",
	"packages/mermaid-electron-renderer/src/custom.d.ts",
]);

const diagnostics = [];

async function collectFiles(directoryPath, files = []) {
	const entries = await readdir(directoryPath, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (!skippedDirectoryNames.has(entry.name)) {
				await collectFiles(path.join(directoryPath, entry.name), files);
			}
			continue;
		}

		if (entry.isFile()) {
			files.push(path.join(directoryPath, entry.name));
		}
	}

	return files;
}

function toRepoPath(filePath) {
	return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function stripKnownExtensions(fileName) {
	return fileName.replace(/(\.d)?\.[^.]+$/u, "");
}

function splitNameIntoTerms(name) {
	return name
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
		.split(/[^A-Za-z0-9]+/u)
		.filter(Boolean)
		.map((term) => term.toLowerCase());
}

function findBlockedTerm(name) {
	return splitNameIntoTerms(name).find((term) => blockedTerms.has(term));
}

function addDiagnostic(filePath, message, location) {
	diagnostics.push({ filePath, location, message });
}

function checkFilePathTerms(repoPath) {
	const parts = repoPath.split("/");
	for (const [index, part] of parts.entries()) {
		const name = index === parts.length - 1 ? stripKnownExtensions(part) : part;
		const blockedTerm = findBlockedTerm(name);
		if (blockedTerm) {
			addDiagnostic(
				repoPath,
				`Path segment "${part}" uses the generic term "${blockedTerm}".`,
			);
		}
	}
}

function repeatedFileNameGroupIsAllowed(fileName, repoPaths) {
	if (standardRepeatedFileNames.has(fileName)) {
		return true;
	}

	return repoPaths.every((repoPath) => allowedRepeatedFilePaths.has(repoPath));
}

function checkRepeatedFileNames(repoPaths) {
	const pathsByFileName = new Map();
	for (const repoPath of repoPaths) {
		const fileName = path.basename(repoPath).toLowerCase();
		const paths = pathsByFileName.get(fileName) ?? [];
		paths.push(repoPath);
		pathsByFileName.set(fileName, paths);
	}

	for (const [fileName, paths] of [...pathsByFileName.entries()].sort()) {
		if (paths.length <= 1 || repeatedFileNameGroupIsAllowed(fileName, paths)) {
			continue;
		}

		addDiagnostic(
			paths[0],
			`File name "${fileName}" is duplicated:\n${paths.map((filePath) => `  - ${filePath}`).join("\n")}`,
		);
	}
}

function printDiagnostics() {
	if (diagnostics.length === 0) {
		console.log("Descriptive name check passed.");
		return;
	}

	console.error("Descriptive name check failed:");
	for (const diagnostic of diagnostics) {
		const location = diagnostic.location
			? `:${diagnostic.location.line}:${diagnostic.location.column}`
			: "";
		console.error(`- ${diagnostic.filePath}${location} ${diagnostic.message}`);
	}
	process.exitCode = 1;
}

const files = await collectFiles(repoRoot);
const repoPaths = files.map(toRepoPath).sort();

checkRepeatedFileNames(repoPaths);

for (const repoPath of repoPaths) {
	checkFilePathTerms(repoPath);
}

printDiagnostics();
