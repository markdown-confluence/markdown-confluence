import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { PlatformError } from "effect/PlatformError";
import { Console, Context, Effect, Layer } from "effect";
import { lookup } from "mime-types";
import { isPathInside, makeContentRootPaths } from "./ContentRootPaths";
import {
	makeMarkdownExpansionBudget,
	MarkdownExpansionLimitsService,
	validateMarkdownExpansionLimits,
	type MarkdownExpansionBudget,
} from "./MarkdownExpansionBudget";
import {
	ConfluencePerPageAllValues,
	ConfluencePerPageConfig,
	conniePerPageConfig,
} from "./ConniePageConfig";
import { runEffect } from "./effects";
import { parseMarkdownFrontmatter, stringifyMarkdownFrontmatter } from "./MarkdownFrontmatter";
import { findMarkdownEmbeds, rebaseEmbeddedLinks, selectEmbeddedMarkdown } from "./MarkdownEmbeds";
import { ConfluenceSettings, ConfluenceSettingsService } from "./Settings";
import {
	MarkdownSourceTransformerService,
	MarkdownPublishFilter,
} from "./MarkdownSourceTransformer";

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
		const sourceTransformer = yield* MarkdownSourceTransformerService;
		const contentRoot = normalizeContentRoot(settings.contentRoot, path);
		yield* validateContentRoot(fs, contentRoot);
		const contentPaths = yield* makeContentRootPaths(fs, path, contentRoot);
		const expansionLimits = { ...(yield* MarkdownExpansionLimitsService) };
		yield* validateMarkdownExpansionLimits(expansionLimits);
		const workspaceSettings = {
			...settings,
			contentRoot,
		};

		const getFileContent = (
			absoluteFilePath: string,
			budget?: MarkdownExpansionBudget,
		): Effect.Effect<MarkdownContent, Error> =>
			Effect.gen(function* () {
				const canonicalFilePath = yield* contentPaths.existing(absoluteFilePath);
				const stats = yield* fs.stat(canonicalFilePath);
				const readBudget =
					budget ?? makeMarkdownExpansionBudget(expansionLimits, absoluteFilePath);
				yield* readBudget.checkSize(stats.size);
				const fileContent = yield* fs.readFileString(canonicalFilePath, "utf-8");
				yield* readBudget.checkText(fileContent);
				yield* readBudget.charge(Buffer.byteLength(fileContent, "utf8"));
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
				const actualAbsoluteFilePath = yield* contentPaths.input(absoluteFilePath);
				const actualFile = yield* contentPaths.existing(actualAbsoluteFilePath).pipe(
					Effect.flatMap((canonical) => fs.stat(canonical)),
					Effect.map((stats) => stats.type === "File"),
					Effect.catch((error) =>
						error instanceof PlatformError && error.reason._tag === "NotFound"
							? logUpdateMarkdownValuesError({
									actualAbsoluteFilePath,
									absoluteFilePath,
									contentRoot: workspaceSettings.contentRoot,
									error,
								}).pipe(Effect.as(false))
							: Effect.fail(error),
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
						if (value !== undefined) {
							fm[key] = value;
						} else if (key in fileContent.data) {
							delete fileContent.data[key];
						}
					}
				}

				const updatedData = stringifyMarkdownFrontmatter(fileContent, fm);
				const canonicalWritePath = yield* contentPaths.existing(actualAbsoluteFilePath);
				yield* fs.writeFileString(canonicalWritePath, updatedData);
			}).pipe(Effect.mapError(toError));

		const transformSource = (
			content: string,
			absoluteFilePath: string,
			frontmatter: Record<string, unknown>,
		) =>
			sourceTransformer.transform(content, {
				absoluteFilePath,
				sourcePath: path
					.relative(workspaceSettings.contentRoot, absoluteFilePath)
					.replaceAll("\\", "/"),
				frontmatter,
			});

		const readMarkdownFile = (absoluteFilePath: string): Effect.Effect<MarkdownFile, Error> =>
			Effect.gen(function* () {
				const { data, content } = yield* getFileContent(absoluteFilePath);
				const fileName = path.basename(absoluteFilePath);
				return {
					folderName: path.basename(path.parse(absoluteFilePath).dir),
					absoluteFilePath: path.relative(contentPaths.root, absoluteFilePath),
					fileName,
					pageTitle: path.basename(fileName, path.extname(fileName)),
					contents: content,
					frontmatter: data,
				};
			}).pipe(Effect.mapError(toError));

		const prepareMarkdownFile = (
			file: MarkdownFile,
			absoluteFilePath: string,
			applySourceTransforms = true,
		): Effect.Effect<MarkdownFile, Error> =>
			Effect.gen(function* () {
				const budget = makeMarkdownExpansionBudget(expansionLimits, absoluteFilePath);
				yield* budget.checkText(file.contents);
				yield* budget.charge(Buffer.byteLength(file.contents, "utf8"));
				const canonicalFilePath = yield* contentPaths.existing(absoluteFilePath);
				const transformed = applySourceTransforms
					? yield* transformSource(file.contents, absoluteFilePath, file.frontmatter)
					: file.contents;
				const contents = yield* expandMarkdownEmbeds(
					transformed,
					absoluteFilePath,
					new Set([canonicalFilePath]),
					applySourceTransforms,
					budget,
				);
				return { ...file, contents };
			});

		const loadMarkdownFile = (absoluteFilePath: string): Effect.Effect<MarkdownFile, Error> =>
			Effect.gen(function* () {
				const logicalPath = yield* contentPaths.input(absoluteFilePath);
				return yield* prepareMarkdownFile(
					yield* readMarkdownFile(logicalPath),
					logicalPath,
				);
			}).pipe(Effect.mapError(toError));

		const loadMarkdownFiles = (
			folderPath: string,
			visitedDirectories = new Set<string>(),
		): Effect.Effect<MarkdownFile[], Error> =>
			Effect.gen(function* () {
				const files: MarkdownFile[] = [];
				const canonicalFolder = yield* contentPaths.existing(folderPath);
				if (visitedDirectories.has(canonicalFolder)) return files;
				visitedDirectories.add(canonicalFolder);
				const entries = yield* Effect.forEach(
					(yield* fs.readDirectory(canonicalFolder)).sort(),
					(entry) =>
						Effect.gen(function* () {
							const absoluteFilePath = path.join(folderPath, entry);
							const canonicalFilePath =
								yield* contentPaths.existing(absoluteFilePath);
							const stats = yield* fs.stat(canonicalFilePath);
							const publishFolder = path.resolve(
								contentPaths.root,
								settings.folderToPublish,
							);
							// Prefer the requested logical route, then the real directory route.
							// An earlier alias must not consume a selected directory's identity.
							const selectedRoute =
								publishFolder !== contentPaths.root &&
								stats.type === "Directory" &&
								(isPathInside(path, absoluteFilePath, publishFolder) ||
									isPathInside(path, publishFolder, absoluteFilePath));
							const canonicalRoute =
								path.relative(contentPaths.root, absoluteFilePath) ===
								path.relative(contentPaths.canonicalRoot, canonicalFilePath);
							return {
								entry,
								absoluteFilePath,
								stats,
								priority: selectedRoute ? 0 : canonicalRoute ? 1 : 2,
							};
						}),
				);
				entries.sort((first, second) => first.priority - second.priority);
				for (const { entry, absoluteFilePath, stats } of entries) {
					if (stats.type === "File" && path.extname(entry) === ".md") {
						files.push(yield* readMarkdownFile(absoluteFilePath));
					} else if (stats.type === "Directory") {
						files.push(
							...(yield* loadMarkdownFiles(absoluteFilePath, visitedDirectories)),
						);
					}
				}
				return files;
			}).pipe(Effect.mapError(toError));

		const getMarkdownFilesToUpload: Effect.Effect<FilesToUpload, Error> = Effect.gen(
			function* () {
				const files = yield* loadMarkdownFiles(workspaceSettings.contentRoot);
				const filesToPublish: MarkdownFile[] = [];
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
				const publishFilter = yield* MarkdownPublishFilter;
				const normalize = (value: string) =>
					value.replaceAll("\\", "/").replace(/^\/+/, "");
				// Keep ordinary embed expansion for page titles/hierarchy in the link mapping,
				// but execute source hooks only for the requested page and its own embeds.
				return yield* Effect.forEach(filesToPublish, (file) =>
					prepareMarkdownFile(
						file,
						path.join(workspaceSettings.contentRoot, file.absoluteFilePath),
						!publishFilter ||
							normalize(file.absoluteFilePath) === normalize(publishFilter),
					),
				);
			},
		).pipe(Effect.mapError(toError));

		function findClosestFile(
			fileName: string,
			startingDirectory: string,
		): Effect.Effect<string | null, Error> {
			return Effect.gen(function* () {
				let searchRoot = yield* contentPaths.assertLogical(startingDirectory);
				// Reject an escaping authored reference, but do not reinterpret a safe
				// missing relative reference as an escape during ancestor fallback.
				yield* contentPaths.assertLogical(path.resolve(searchRoot, fileName));
				const visitedDirectories = new Set<string>();
				while (true) {
					const candidate = path.resolve(searchRoot, fileName);
					if (
						isPathInside(path, contentPaths.root, candidate) &&
						(yield* fs.exists(candidate))
					) {
						const canonicalCandidate = yield* contentPaths.existing(candidate);
						if ((yield* fs.stat(canonicalCandidate)).type === "File") return candidate;
					}
					const directories = [searchRoot];
					for (
						let directoryIndex = 0;
						directoryIndex < directories.length;
						directoryIndex++
					) {
						const directory = directories[directoryIndex]!;
						const canonicalDirectory = yield* contentPaths.existing(directory);
						if (visitedDirectories.has(canonicalDirectory)) continue;
						visitedDirectories.add(canonicalDirectory);
						for (const entry of (yield* fs.readDirectory(canonicalDirectory)).sort()) {
							const fullPath = path.join(directory, entry);
							const canonicalEntry = yield* contentPaths.existing(fullPath);
							const stats = yield* fs.stat(canonicalEntry);
							if (
								stats.type === "File" &&
								entry.toLowerCase() === fileName.toLowerCase()
							)
								return fullPath;
							if (stats.type === "Directory") directories.push(fullPath);
						}
					}
					if (searchRoot === contentPaths.root) return null;
					searchRoot = path.dirname(searchRoot);
				}
			}).pipe(Effect.mapError(toError));
		}

		function expandMarkdownEmbeds(
			contents: string,
			referencedFromFilePath: string,
			seenFiles: Set<string>,
			applySourceTransforms: boolean,
			budget: MarkdownExpansionBudget,
		): Effect.Effect<string, Error> {
			return Effect.gen(function* () {
				yield* budget.checkText(contents);
				yield* budget.charge(Buffer.byteLength(contents, "utf8"));
				const chunks: string[] = [];
				let expandedBytes = 0;
				const append = (chunk: string) =>
					Effect.gen(function* () {
						const bytes = Buffer.byteLength(chunk, "utf8");
						yield* budget.checkSize(expandedBytes + bytes);
						yield* budget.charge(bytes);
						expandedBytes += bytes;
						chunks.push(chunk);
					});
				let currentIndex = 0;

				for (const match of findMarkdownEmbeds(contents)) {
					const embedTarget = match[1];
					const embedStart = match.index!;
					const embedEnd = embedStart + match[0].length;

					yield* append(contents.slice(currentIndex, embedStart));
					currentIndex = embedEnd;

					if (!embedTarget) {
						yield* append(match[0]);
						continue;
					}

					const replacement = yield* resolveMarkdownEmbed(
						match[0],
						embedTarget,
						referencedFromFilePath,
						seenFiles,
						applySourceTransforms,
						budget,
					);
					yield* append(replacement);
				}

				yield* append(contents.slice(currentIndex));
				return chunks.join("");
			}).pipe(Effect.mapError(toError));
		}

		function resolveMarkdownEmbed(
			originalEmbed: string,
			rawTarget: string,
			referencedFromFilePath: string,
			seenFiles: Set<string>,
			applySourceTransforms: boolean,
			budget: MarkdownExpansionBudget,
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

				yield* budget.visit();
				const markdownTarget = targetExtension ? target : `${target}.md`;
				const embeddedFilePath = yield* findClosestFile(
					markdownTarget,
					path.dirname(referencedFromFilePath),
				);

				if (!embeddedFilePath) {
					return originalEmbed;
				}
				const canonicalEmbeddedFile = yield* contentPaths.existing(embeddedFilePath);
				if (seenFiles.has(canonicalEmbeddedFile) || seenFiles.size >= 50) {
					return yield* Effect.fail(
						new Error(`Circular or excessively nested Markdown embed: ${rawTarget}`),
					);
				}

				const embeddedContent = yield* getFileContent(embeddedFilePath, budget);
				const selectedContent = yield* Effect.try({
					try: () => selectEmbeddedMarkdown(embeddedContent.content, fragment),
					catch: toError,
				});
				const transformedContent = applySourceTransforms
					? yield* transformSource(
							selectedContent,
							embeddedFilePath,
							embeddedContent.data,
						)
					: selectedContent;
				const expandedEmbeddedContent = yield* expandMarkdownEmbeds(
					transformedContent,
					embeddedFilePath,
					new Set([...seenFiles, canonicalEmbeddedFile]),
					applySourceTransforms,
					budget,
				);

				yield* budget.charge(Buffer.byteLength(expandedEmbeddedContent, "utf8"));
				const targets = new Set<string>();
				rebaseEmbeddedLinks(expandedEmbeddedContent, (link) => {
					targets.add(link);
					return link;
				});
				const resolvedLinks = new Map<string, string>();
				for (const link of targets) {
					yield* budget.visit();
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
				yield* budget.charge(Buffer.byteLength(expandedEmbeddedContent, "utf8"));
				const rebased = yield* Effect.try({
					try: () =>
						rebaseEmbeddedLinks(
							expandedEmbeddedContent,
							(link) => resolvedLinks.get(link) ?? link,
							expansionLimits.maxPageBytes,
						),
					catch: toError,
				});
				yield* budget.checkText(rebased);
				const wrappedBytes = Buffer.byteLength(rebased.trim(), "utf8") + 4;
				yield* budget.checkSize(wrappedBytes);
				yield* budget.charge(wrappedBytes);
				return `\n\n${rebased.trim()}\n\n`;
			}).pipe(Effect.mapError(toError));
		}

		const readBinary = (
			searchPath: string,
			referencedFromFilePath: string,
		): Effect.Effect<BinaryFile | false, Error> =>
			Effect.gen(function* () {
				const referencePath = yield* contentPaths.reference(referencedFromFilePath);
				const absoluteFilePath = yield* findClosestFile(
					searchPath,
					path.dirname(referencePath),
				);

				if (absoluteFilePath) {
					const canonicalFilePath = yield* contentPaths.existing(absoluteFilePath);
					const fileContents = yield* fs.readFile(canonicalFilePath);

					const mimeType =
						lookup(path.extname(absoluteFilePath)) || "application/octet-stream";
					return {
						contents: fileContents,
						filePath: path.relative(contentPaths.root, absoluteFilePath),
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
				const referencePath = yield* contentPaths.reference(referencedFromFilePath);
				const absoluteFilePath = yield* findClosestFile(
					searchPath,
					path.dirname(referencePath),
				);

				if (absoluteFilePath) {
					return yield* fs.readFileString(
						yield* contentPaths.existing(absoluteFilePath),
						"utf-8",
					);
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

function normalizeContentRoot(contentRoot: string, path: Path): string {
	const resolvedContentRoot = path.resolve(contentRoot);
	return resolvedContentRoot.endsWith(path.sep)
		? resolvedContentRoot
		: `${resolvedContentRoot}${path.sep}`;
}

export function shouldPublishMarkdownFile(
	absoluteFilePath: string,
	frontmatter: Record<string, unknown> | undefined,
	settings: ConfluenceSettings,
): boolean {
	const normalize = (value: string) =>
		value
			.replaceAll("\\", "/")
			.replace(/^\/+|\/+$/g, "")
			.replace(/^\.\//, "");
	const relativePath = normalize(absoluteFilePath);
	if (
		(settings.foldersToExclude ?? []).some((value) => {
			const folder = normalize(value.trim());
			return (
				folder !== "" &&
				(folder === "." || relativePath === folder || relativePath.startsWith(`${folder}/`))
			);
		})
	)
		return false;
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
