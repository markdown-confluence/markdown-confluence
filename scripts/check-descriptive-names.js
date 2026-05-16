#!/usr/bin/env node

import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { fileURLToPath } from "node:url";

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
	"packages/lib/src/effects/index.ts",
	"packages/lib/src/index.ts",
	"packages/mermaid-electron-renderer/src/index.ts",
	"packages/mermaid-puppeteer-renderer/src/index.ts",
	"packages/obsidian/src/custom.d.ts",
	"packages/lib/src/custom.d.ts",
	"packages/mermaid-electron-renderer/src/custom.d.ts",
]);

const diagnostics = [];
const nodePlatformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

function collectFiles(directoryPath, filesystem, filesystemPath, files = []) {
	return Effect.gen(function* () {
		const entries = yield* filesystem.readDirectory(directoryPath);
		for (const entryName of entries) {
			if (skippedDirectoryNames.has(entryName)) {
				continue;
			}

			const entryPath = filesystemPath.join(directoryPath, entryName);
			const stats = yield* filesystem.stat(entryPath);
			if (stats.type === "Directory") {
				yield* collectFiles(entryPath, filesystem, filesystemPath, files);
				continue;
			}

			if (stats.type === "File") {
				files.push(entryPath);
			}
		}

		return files;
	});
}

function toRepositoryPath(filePath, repositoryRoot, filesystemPath) {
	return filesystemPath.relative(repositoryRoot, filePath).split(filesystemPath.sep).join("/");
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

function checkFilePathTerms(repositoryPath) {
	const parts = repositoryPath.split("/");
	for (const [index, part] of parts.entries()) {
		const name = index === parts.length - 1 ? stripKnownExtensions(part) : part;
		const blockedTerm = findBlockedTerm(name);
		if (blockedTerm) {
			addDiagnostic(
				repositoryPath,
				`Path segment "${part}" uses the generic term "${blockedTerm}".`,
			);
		}
	}
}

function repeatedFileNameGroupIsAllowed(fileName, repositoryPaths) {
	if (standardRepeatedFileNames.has(fileName)) {
		return true;
	}

	return repositoryPaths.every((repositoryPath) => allowedRepeatedFilePaths.has(repositoryPath));
}

function checkRepeatedFileNames(repositoryPaths, filesystemPath) {
	const pathsByFileName = new Map();
	for (const repositoryPath of repositoryPaths) {
		const fileName = filesystemPath.basename(repositoryPath).toLowerCase();
		const paths = pathsByFileName.get(fileName) ?? [];
		paths.push(repositoryPath);
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
		return false;
	}

	console.error("Descriptive name check failed:");
	for (const diagnostic of diagnostics) {
		const location = diagnostic.location
			? `:${diagnostic.location.line}:${diagnostic.location.column}`
			: "";
		console.error(`- ${diagnostic.filePath}${location} ${diagnostic.message}`);
	}
	return true;
}

function checkDescriptiveNames() {
	return Effect.gen(function* () {
		const filesystem = yield* FileSystem;
		const filesystemPath = yield* Path;
		const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
		const repositoryRoot = filesystemPath.resolve(scriptDirectory, "..");
		const files = yield* collectFiles(repositoryRoot, filesystem, filesystemPath);
		const repositoryPaths = files
			.map((filePath) => toRepositoryPath(filePath, repositoryRoot, filesystemPath))
			.sort();

		checkRepeatedFileNames(repositoryPaths, filesystemPath);

		for (const repositoryPath of repositoryPaths) {
			checkFilePathTerms(repositoryPath);
		}

		return printDiagnostics();
	});
}

const hasDiagnostics = await Effect.runPromise(
	checkDescriptiveNames().pipe(Effect.provide(nodePlatformLayer)),
);

if (hasDiagnostics) {
	globalThis.process.exitCode = 1;
}
