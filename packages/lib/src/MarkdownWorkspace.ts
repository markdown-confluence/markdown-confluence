import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Console, Context, Effect, Layer } from "effect";
import { lookup } from "mime-types";
import {
	ConfluencePerPageAllValues,
	ConfluencePerPageConfig,
	conniePerPageConfig,
} from "./ConniePageConfig";
import { runEffect } from "./effects";
import { parseMarkdownFrontmatter, stringifyMarkdownFrontmatter } from "./MarkdownFrontmatter";
import { findMarkdownEmbeds, rebaseEmbeddedLinks, selectEmbeddedMarkdown } from "./MarkdownEmbeds";
import { ConfluenceSettings, ConfluenceSettingsService } from "./Settings";

interface MarkdownContent {
	data: Record<string, unknown>;
	content: string;
}

export type FilesToUpload = Array<MarkdownFile>;

export interface MarkdownFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: string;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
}

export interface BinaryFile {
	filename: string;
	filePath: string;
	mimeType: string;
	contents: ArrayBuffer | Uint8Array;
}

export interface MarkdownWorkspace {
	updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePerPageAllValues>,
	): Effect.Effect<void, Error>;
	loadMarkdownFile(absoluteFilePath: string): Effect.Effect<MarkdownFile, Error>;
	getMarkdownFilesToUpload: Effect.Effect<FilesToUpload, Error>;
	readBinary(
		searchPath: string,
		referencedFromFilePath: string,
	): Effect.Effect<BinaryFile | false, Error>;
	readText(
		searchPath: string,
		referencedFromFilePath: string,
	): Effect.Effect<string | false, Error>;
}

export class MarkdownWorkspaceService extends Context.Service<
	MarkdownWorkspaceService,
	MarkdownWorkspace
>()("@markdown-confluence/MarkdownWorkspace") {}

export const MarkdownWorkspaceLive: Layer.Layer<
	MarkdownWorkspaceService,
	Error,
	ConfluenceSettingsService | FileSystem | Path
> = Layer.effect(MarkdownWorkspaceService)(
	Effect.gen(function* () {
		const settings = yield* ConfluenceSettingsService;
		return yield* makeMarkdownWorkspaceEffect(settings);
	}),
);

export function loadMarkdownWorkspace(settings: ConfluenceSettings): Promise<MarkdownWorkspace> {
	return runEffect(makeMarkdownWorkspaceEffect(settings));
}

export function makeMarkdownWorkspaceEffect(
	settings: ConfluenceSettings,
): Effect.Effect<MarkdownWorkspace, Error, FileSystem | Path> {
	return Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		const contentRoot = normalizeContentRoot(settings.contentRoot, path);
		yield* validateContentRoot(fs, contentRoot);
		const workspaceSettings = {
			...settings,
			contentRoot,
		};

		const getFileContent = (absoluteFilePath: string): Effect.Effect<MarkdownContent, Error> =>
			Effect.gen(function* () {
				const fileContent = yield* fs.readFileString(absoluteFilePath, "utf-8");
				const parsed = parseMarkdownFrontmatter(fileContent);

				return {
					data: parsed.data,
					content: parsed.content,
				};
			}).pipe(Effect.mapError(toError));

		const updateMarkdownValues = (
			absoluteFilePath: string,
			values: Partial<ConfluencePerPageAllValues>,
		): Effect.Effect<void, Error> =>
			Effect.gen(function* () {
				const actualAbsoluteFilePath = yield* resolveContentFilePath(
					fs,
					path,
					workspaceSettings.contentRoot,
					absoluteFilePath,
				);
				const actualFile = yield* fs.stat(actualAbsoluteFilePath).pipe(
					Effect.map((stats) => stats.type === "File"),
					Effect.catch((error) =>
						logUpdateMarkdownValuesError({
							actualAbsoluteFilePath,
							absoluteFilePath,
							contentRoot: workspaceSettings.contentRoot,
							error,
						}).pipe(Effect.as(false)),
					),
				);

				if (!actualFile) {
					return;
				}

				const fileContent = yield* getFileContent(actualAbsoluteFilePath);

				const config = conniePerPageConfig;

				const fm: { [key: string]: unknown } = {};
				for (const propertyKey in config) {
					if (!config.hasOwnProperty(propertyKey)) {
						continue;
					}

					const { key } = config[propertyKey as keyof ConfluencePerPageConfig];
					const value = values[propertyKey as keyof ConfluencePerPageAllValues];
					if (propertyKey in values) {
						if (value) {
							fm[key] = value;
						} else if (key in fileContent.data) {
							delete fileContent.data[key];
						}
					}
				}

				const updatedData = stringifyMarkdownFrontmatter(fileContent, fm);
				yield* fs.writeFileString(actualAbsoluteFilePath, updatedData);
			}).pipe(Effect.mapError(toError));

		const loadMarkdownFile = (absoluteFilePath: string): Effect.Effect<MarkdownFile, Error> =>
			Effect.gen(function* () {
				const { data, content } = yield* getFileContent(absoluteFilePath);
				const contents = yield* expandMarkdownEmbeds(
					content,
					absoluteFilePath,
					new Set([absoluteFilePath]),
				);

				const folderName = path.basename(path.parse(absoluteFilePath).dir);
				const fileName = path.basename(absoluteFilePath);

				const extension = path.extname(fileName);
				const pageTitle = path.basename(fileName, extension);

				return {
					folderName,
					absoluteFilePath: absoluteFilePath.replace(workspaceSettings.contentRoot, ""),
					fileName,
					pageTitle,
					contents,
					frontmatter: data,
				};
			}).pipe(Effect.mapError(toError));

		const loadMarkdownFiles = (folderPath: string): Effect.Effect<MarkdownFile[], Error> =>
			Effect.gen(function* () {
				const files: MarkdownFile[] = [];

				const entries = yield* fs.readDirectory(folderPath);

				for (const entry of entries) {
					const absoluteFilePath = path.join(folderPath, entry);
					const stats = yield* fs.stat(absoluteFilePath);

					if (stats.type === "File" && path.extname(entry) === ".md") {
						const file = yield* loadMarkdownFile(absoluteFilePath);
						files.push(file);
					} else if (stats.type === "Directory") {
						const subFiles = yield* loadMarkdownFiles(absoluteFilePath);
						files.push(...subFiles);
					}
				}

				return files;
			}).pipe(Effect.mapError(toError));

		const getMarkdownFilesToUpload: Effect.Effect<FilesToUpload, Error> = Effect.gen(
			function* () {
				const files = yield* loadMarkdownFiles(workspaceSettings.contentRoot);
				const filesToPublish = [];
				for (const file of files) {
					try {
						if (
							shouldPublishMarkdownFile(
								file.absoluteFilePath,
								file.frontmatter,
								workspaceSettings,
							)
						) {
							filesToPublish.push(file);
						}
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : JSON.stringify(error);
						yield* Console.warn(
							"Skipping markdown file",
							JSON.stringify({
								absoluteFilePath: file.absoluteFilePath,
								errorMessage,
							}),
						);
					}
				}
				return filesToPublish;
			},
		).pipe(Effect.mapError(toError));

		function findClosestFile(
			fileName: string,
			startingDirectory: string,
		): Effect.Effect<string | null, Error> {
			return Effect.gen(function* () {
				const potentialAbsolutePathForFileName = path.join(startingDirectory, fileName);
				if (yield* isFile(fs, potentialAbsolutePathForFileName)) {
					return potentialAbsolutePathForFileName;
				}

				const matchingFiles: string[] = [];
				const directoriesToSearch: string[] = [startingDirectory];

				while (directoriesToSearch.length > 0) {
					const currentDirectory = directoriesToSearch.shift();
					if (!currentDirectory) {
						continue;
					}

					const entries = yield* fs.readDirectory(currentDirectory);

					for (const entry of entries) {
						const fullPath = path.join(currentDirectory, entry);
						const stats = yield* fs.stat(fullPath);

						if (
							stats.type === "File" &&
							entry.toLowerCase() === fileName.toLowerCase()
						) {
							matchingFiles.push(fullPath);
						} else if (
							stats.type === "Directory" &&
							fullPath.startsWith(workspaceSettings.contentRoot)
						) {
							directoriesToSearch.push(fullPath);
						}
					}
				}

				const firstMatchedFile = matchingFiles[0];
				if (firstMatchedFile) {
					return firstMatchedFile;
				}

				const parentDirectory = path.dirname(startingDirectory);

				if (parentDirectory === startingDirectory) {
					return null;
				}

				return yield* findClosestFile(fileName, parentDirectory);
			}).pipe(Effect.mapError(toError));
		}

		function expandMarkdownEmbeds(
			contents: string,
			referencedFromFilePath: string,
			seenFiles: Set<string>,
		): Effect.Effect<string, Error> {
			return Effect.gen(function* () {
				let expandedContents = "";
				let currentIndex = 0;

				for (const match of findMarkdownEmbeds(contents)) {
					const embedTarget = match[1];
					const embedStart = match.index!;
					const embedEnd = embedStart + match[0].length;

					expandedContents += contents.slice(currentIndex, embedStart);
					currentIndex = embedEnd;

					if (!embedTarget) {
						expandedContents += match[0];
						continue;
					}

					const replacement = yield* resolveMarkdownEmbed(
						match[0],
						embedTarget,
						referencedFromFilePath,
						seenFiles,
					);
					expandedContents += replacement;
				}

				expandedContents += contents.slice(currentIndex);
				return expandedContents;
			}).pipe(Effect.mapError(toError));
		}

		function resolveMarkdownEmbed(
			originalEmbed: string,
			rawTarget: string,
			referencedFromFilePath: string,
			seenFiles: Set<string>,
		): Effect.Effect<string, Error> {
			return Effect.gen(function* () {
				const [targetValue, fragment] = (rawTarget.split("|")[0] ?? "").split("#");
				const target = targetValue?.trim();
				if (!target) {
					return originalEmbed;
				}

				const targetExtension = path.extname(target).toLowerCase();
				if (targetExtension && targetExtension !== ".md") {
					return originalEmbed;
				}

				const markdownTarget = targetExtension ? target : `${target}.md`;
				const embeddedFilePath = yield* findClosestFile(
					markdownTarget,
					path.dirname(referencedFromFilePath),
				);

				if (!embeddedFilePath) {
					return originalEmbed;
				}
				if (seenFiles.has(embeddedFilePath) || seenFiles.size >= 50) {
					return yield* Effect.fail(
						new Error(`Circular or excessively nested Markdown embed: ${rawTarget}`),
					);
				}

				const embeddedContent = yield* getFileContent(embeddedFilePath);
				const selectedContent = yield* Effect.try({
					try: () => selectEmbeddedMarkdown(embeddedContent.content, fragment),
					catch: toError,
				});
				const expandedEmbeddedContent = yield* expandMarkdownEmbeds(
					selectedContent,
					embeddedFilePath,
					new Set([...seenFiles, embeddedFilePath]),
				);

				const targets = new Set<string>();
				rebaseEmbeddedLinks(expandedEmbeddedContent, (link) => {
					targets.add(link);
					return link;
				});
				const resolvedLinks = new Map<string, string>();
				for (const link of targets) {
					const sourcePath = yield* findClosestFile(
						path.extname(link) ? link : `${link}.md`,
						path.dirname(embeddedFilePath),
					);
					if (sourcePath)
						resolvedLinks.set(
							link,
							path
								.relative(path.dirname(referencedFromFilePath), sourcePath)
								.replaceAll("\\", "/"),
						);
				}
				const rebased = rebaseEmbeddedLinks(
					expandedEmbeddedContent,
					(link) => resolvedLinks.get(link) ?? link,
				);
				return `\n\n${rebased.trim()}\n\n`;
			}).pipe(Effect.mapError(toError));
		}

		const readBinary = (
			searchPath: string,
			referencedFromFilePath: string,
		): Effect.Effect<BinaryFile | false, Error> =>
			Effect.gen(function* () {
				const absoluteFilePath = yield* findClosestFile(
					searchPath,
					path.dirname(path.join(workspaceSettings.contentRoot, referencedFromFilePath)),
				);

				if (absoluteFilePath) {
					const fileContents = yield* fs.readFile(absoluteFilePath);

					const mimeType =
						lookup(path.extname(absoluteFilePath)) || "application/octet-stream";
					return {
						contents: fileContents,
						filePath: absoluteFilePath.replace(workspaceSettings.contentRoot, ""),
						filename: path.basename(absoluteFilePath),
						mimeType,
					};
				}

				return false;
			}).pipe(Effect.mapError(toError));

		const readText = (
			searchPath: string,
			referencedFromFilePath: string,
		): Effect.Effect<string | false, Error> =>
			Effect.gen(function* () {
				const absoluteFilePath = yield* findClosestFile(
					searchPath,
					path.dirname(path.join(workspaceSettings.contentRoot, referencedFromFilePath)),
				);

				if (absoluteFilePath) {
					return yield* fs.readFileString(absoluteFilePath, "utf-8");
				}

				return false;
			}).pipe(Effect.mapError(toError));

		return {
			updateMarkdownValues,
			loadMarkdownFile,
			getMarkdownFilesToUpload,
			readBinary,
			readText,
		};
	});
}

function validateContentRoot(fs: FileSystem, contentRoot: string): Effect.Effect<void, Error> {
	return Effect.gen(function* () {
		const exists = yield* fs.exists(contentRoot);
		if (!exists) {
			return yield* Effect.fail(new Error(`'${contentRoot}' doesn't exist.`));
		}

		const stats = yield* fs.stat(contentRoot).pipe(Effect.mapError(toError));
		if (stats.type !== "Directory") {
			return yield* Effect.fail(new Error(`'${contentRoot}' is not a directory.`));
		}
	});
}

function resolveContentFilePath(
	fs: FileSystem,
	path: Path,
	contentRoot: string,
	filePath: string,
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		if (path.isAbsolute(filePath)) {
			return filePath;
		}

		const pathFromContentRoot = path.resolve(contentRoot, filePath);
		const pathFromWorkingDirectory = path.resolve(filePath);

		if (isPathInside(path, contentRoot, pathFromWorkingDirectory)) {
			const workingDirectoryPathExists = yield* fs.exists(pathFromWorkingDirectory);
			const contentRootPathExists = yield* fs.exists(pathFromContentRoot);
			if (workingDirectoryPathExists || !contentRootPathExists) {
				return pathFromWorkingDirectory;
			}
		}

		return pathFromContentRoot;
	});
}

function isPathInside(path: Path, parentPath: string, childPath: string): boolean {
	const relativePath = path.relative(parentPath, childPath);
	return (
		relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	);
}

function normalizeContentRoot(contentRoot: string, path: Path): string {
	const resolvedContentRoot = path.resolve(contentRoot);
	return resolvedContentRoot.endsWith(path.sep)
		? resolvedContentRoot
		: `${resolvedContentRoot}${path.sep}`;
}

function isFile(fs: FileSystem, filePath: string): Effect.Effect<boolean, never> {
	return fs.stat(filePath).pipe(
		Effect.map((stats) => stats.type === "File"),
		Effect.catch(() => Effect.succeed(false)),
	);
}

export function shouldPublishMarkdownFile(
	absoluteFilePath: string,
	frontmatter: Record<string, unknown> | undefined,
	settings: ConfluenceSettings,
): boolean {
	if (frontmatter?.["connie-publish"] === false) {
		return false;
	}

	if (frontmatter?.["connie-publish"] === true) {
		return true;
	}

	const filePath = absoluteFilePath.replaceAll("\\", "/");
	const folder = settings.folderToPublish.replaceAll("\\", "/").replace(/\/$/, "");
	if (folder === "." || filePath.startsWith(`${folder}/`)) {
		return true;
	}

	return hasMatchingPublishTag(frontmatter, settings.tagsToPublish);
}

function hasMatchingPublishTag(
	frontmatter: Record<string, unknown> | undefined,
	tagsToPublish: string,
): boolean {
	const publishTags = parseTags(tagsToPublish);
	if (publishTags.size === 0) {
		return false;
	}

	for (const tag of parseFrontmatterTags(frontmatter?.["tags"])) {
		if (publishTags.has(tag)) {
			return true;
		}
	}

	return false;
}

function parseFrontmatterTags(tags: unknown): Set<string> {
	if (Array.isArray(tags)) {
		return new Set(
			tags
				.filter((tag): tag is string => typeof tag === "string")
				.map(normalizeTag)
				.filter((tag) => tag.length > 0),
		);
	}

	if (typeof tags === "string") {
		return parseTags(tags);
	}

	return new Set();
}

function parseTags(value: string): Set<string> {
	return new Set(
		value
			.split(/[\s,]+/)
			.map(normalizeTag)
			.filter((tag) => tag.length > 0),
	);
}

function normalizeTag(tag: string): string {
	return tag.trim().replace(/^#/, "").toLowerCase();
}

function logUpdateMarkdownValuesError(input: {
	actualAbsoluteFilePath: string;
	absoluteFilePath: string;
	contentRoot: string;
	error: unknown;
}): Effect.Effect<void> {
	const errorMessage =
		input.error instanceof Error ? input.error.message : JSON.stringify(input.error);
	return Console.warn(
		"updateMarkdownValues",
		JSON.stringify({
			actualAbsoluteFilePath: input.actualAbsoluteFilePath,
			absoluteFilePath: input.absoluteFilePath,
			contentRoot: input.contentRoot,
			errorMessage,
		}),
	);
}

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : JSON.stringify(error));
}
