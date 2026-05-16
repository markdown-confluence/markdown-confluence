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

/**
 * Recursively collects file paths under a directory into an array.
 *
 * Traverses the directory tree rooted at `directoryPath`, appending each file's full path
 * to `files`. Directory entries whose names appear in `skippedDirectoryNames` are not recursed into.
 *
 * @param {string} directoryPath - Absolute or relative path of the directory to traverse.
 * @param {string[]} [files] - Optional accumulator array to receive discovered file paths.
 * @returns {string[]} An array of full file paths discovered under `directoryPath`.
 */
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

/**
 * Convert an absolute filesystem path to a normalized repository-relative path.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {string} The path relative to the repository root, using forward slashes; may contain `../` segments if `filePath` is outside the repo root.
 */
function toRepoPath(filePath) {
	return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

/**
 * Normalize a filename by removing its final extension and an optional leading `.d` qualifier.
 * @param {string} fileName - The filename or path segment to normalize.
 * @returns {string} The input with the last extension removed; if the extension was preceded by `.d` (e.g., `.d.ts`), that `.d` is also removed.
 */
function stripKnownExtensions(fileName) {
	return fileName.replace(/(\.d)?\.[^.]+$/u, "");
}

/**
 * Split an identifier or filename segment into lowercase word terms.
 *
 * Converts camelCase, PascalCase, acronym boundaries, and non-alphanumeric separators into individual lowercase terms.
 * @param {string} name - The input string to tokenize.
 * @returns {string[]} An array of lowercase terms extracted from the input.
 */
function splitNameIntoTerms(name) {
	return name
		.replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
		.split(/[^A-Za-z0-9]+/u)
		.filter(Boolean)
		.map((term) => term.toLowerCase());
}

/**
 * Finds the first blocked term present in a name.
 * @param {string} name - Path segment or filename to inspect.
 * @returns {string|undefined} The first blocked term found in `name`, or `undefined` if none is present.
 */
function findBlockedTerm(name) {
	return splitNameIntoTerms(name).find((term) => blockedTerms.has(term));
}

/**
 * Record a diagnostic message associated with a repository file path.
 * @param {string} filePath - Repository-relative path of the file where the diagnostic applies.
 * @param {string} message - Human-readable diagnostic message.
 * @param {{line?: number, column?: number}|undefined|null} [location] - Optional location object with 1-based `line` and `column` numbers; may be omitted or falsy.
 */
function addDiagnostic(filePath, message, location) {
	diagnostics.push({ filePath, location, message });
}

/**
 * Check each segment of a repository-relative path for blocked generic terms and add diagnostics for any offending segments.
 * @param {string} repoPath - Repository-relative path (forward-slash separated) to inspect.
 */
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

/**
 * Determine whether a group of files that share the same base filename is permitted to be duplicated in the repository.
 * @param {string} fileName - The base filename (expected to be normalized to lowercase).
 * @param {string[]} repoPaths - Repository-relative paths for each occurrence of the filename.
 * @returns {boolean} `true` if the filename is allowed to repeat (either it's a standard repeated name or every occurrence is explicitly allowlisted), `false` otherwise.
 */
function repeatedFileNameGroupIsAllowed(fileName, repoPaths) {
	if (standardRepeatedFileNames.has(fileName)) {
		return true;
	}

	return repoPaths.every((repoPath) => allowedRepeatedFilePaths.has(repoPath));
}

/**
 * Detects duplicated file base names across repo paths and records a diagnostic for each disallowed group.
 *
 * Groups the provided repository-relative paths by case-insensitive base filename and, for any filename
 * that appears more than once and is not allowed by the allowlist, adds a single diagnostic on the first
 * occurrence listing all duplicate locations.
 * @param {string[]} repoPaths - Repository-relative file paths to check.
 */
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

/**
 * Reports collected diagnostics to the console and sets the process exit code on failure.
 *
 * If no diagnostics are present, prints "Descriptive name check passed." to stdout.
 * If diagnostics exist, prints "Descriptive name check failed:" to stderr, then prints each diagnostic
 * as "- <filePath>[:line:column] <message>" (omitting the line/column suffix when location is absent),
 * and sets process.exitCode to 1.
 */
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
