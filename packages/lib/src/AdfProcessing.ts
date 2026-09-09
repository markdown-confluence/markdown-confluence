import { traverse } from "@atlaskit/adf-utils/traverse";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ConfluenceAdfFile, ConfluenceNode } from "./Publisher";
import { ConfluenceSettings, resolveSiteUrl } from "./Settings";
import { marksEqual } from "./AdfEqual";
import { ADFEntity } from "@atlaskit/adf-utils/types";
import { p } from "@atlaskit/adf-utils/builders";
import { Console, Effect } from "effect";
import { remapInlineComments } from "./InlineCommentMapping";

export function prepareAdfToUpload(
	confluencePagesToPublish: ConfluenceNode[],
	settings: ConfluenceSettings,
	options: { mapInlineComments?: boolean } = {},
) {
	const fileToPageIdMap: Record<string, ConfluenceAdfFile> = {};

	confluencePagesToPublish.forEach((node) => {
		for (const key of getWikilinkLookupKeys(node.file, settings)) {
			fileToPageIdMap[key] = node.file;
		}
	});

	confluencePagesToPublish.forEach((confluenceNode) => {
		let result = confluenceNode.file.contents;

		if (result.content.length === 0) {
			result.content = [p()];
		}

		result = processWikilinkToActualLink(
			confluenceNode.file,
			result,
			fileToPageIdMap,
			settings,
		);

		result = mergeTextNodes(result);

		if (options.mapInlineComments !== false) {
			const mapped = remapInlineComments(result, confluenceNode.existingPageData.adfContent);
			result = mapped.document;
			if (mapped.limitReached) {
				Effect.runSync(
					Console.warn(
						"Inline comment matching reached a safety limit; unmapped annotations were preserved.",
					),
				);
			}
		}

		confluenceNode.file.contents = result;
	});
}

function processWikilinkToActualLink(
	currentFile: ConfluenceAdfFile,
	adf: JSONDocNode,
	fileToPageIdMap: Record<string, ConfluenceAdfFile>,
	settings: ConfluenceSettings,
) {
	return traverse(adf, {
		text: (node, _parent) => {
			if (
				node.marks &&
				node.marks[0] &&
				node.marks[0].type === "link" &&
				node.marks[0].attrs
			) {
				if (
					typeof node.marks[0].attrs["href"] === "string" &&
					node.marks[0].attrs["href"].startsWith("wikilink")
				) {
					const wikilinkUrl = new URL(node.marks[0].attrs["href"]);

					const pathName = normalizeWikilinkPath(decodeURI(wikilinkUrl.pathname));
					const pathNameParts = pathName.split("/");
					const displayFileName = pathNameParts[pathNameParts.length - 1] ?? pathName;
					const linkPage =
						wikilinkUrl.pathname !== ""
							? findLinkedPage(pathName, currentFile, fileToPageIdMap, settings)
							: currentFile;

					if (linkPage) {
						const confluenceUrl = `${resolveSiteUrl(settings)}/wiki/spaces/${linkPage.spaceKey}/pages/${linkPage.pageId}${wikilinkUrl.hash}`;
						node.marks[0].attrs["href"] = confluenceUrl;
						if (
							node.text === `${pathName}${wikilinkUrl.hash}` ||
							node.text === `${displayFileName}${wikilinkUrl.hash}`
						) {
							node.type = "inlineCard";
							node.attrs = {
								url: node.marks[0].attrs["href"],
							};
							delete node.marks;
							delete node.text;
							return node;
						}
					} else {
						node.marks.splice(0, 1);
					}
					return node;
				}
				if (
					typeof node.marks[0].attrs["href"] === "string" &&
					node.marks[0].attrs["href"].startsWith("mention:")
				) {
					const mentionUrl = new URL(node.marks[0].attrs["href"]);

					node = {
						type: "mention",
						attrs: {
							id: decodeURI(mentionUrl.pathname),
							text: node.text,
						},
					};

					return node;
				}
			}
			return;
		},
	}) as JSONDocNode;
}

function getWikilinkLookupKeys(file: ConfluenceAdfFile, settings: ConfluenceSettings) {
	const keys = new Set<string>([file.fileName]);
	const normalizedPath = normalizeWikilinkPath(file.absoluteFilePath);
	const folderToPublish = normalizeWikilinkPath(settings.folderToPublish);

	if (normalizedPath) {
		keys.add(normalizedPath);
	}

	if (
		folderToPublish &&
		folderToPublish !== "." &&
		normalizedPath.startsWith(`${folderToPublish}/`)
	) {
		keys.add(normalizedPath.slice(folderToPublish.length + 1));
	}

	return keys;
}

function findLinkedPage(
	pathName: string,
	currentFile: ConfluenceAdfFile,
	fileToPageIdMap: Record<string, ConfluenceAdfFile>,
	settings: ConfluenceSettings,
) {
	for (const candidate of getWikilinkPathCandidates(pathName, currentFile, settings)) {
		const page = fileToPageIdMap[candidate];
		if (page) {
			return page;
		}
	}

	return undefined;
}

function getWikilinkPathCandidates(
	pathName: string,
	currentFile: ConfluenceAdfFile,
	settings: ConfluenceSettings,
) {
	const pathCandidates = [
		withMarkdownExtension(pathName),
		normalizePathSegments(pathName),
		joinPaths(dirname(currentFile.absoluteFilePath), withMarkdownExtension(pathName)),
		joinPaths(dirname(currentFile.absoluteFilePath), pathName),
	];
	const folderToPublish = normalizePathSegments(settings.folderToPublish);

	if (folderToPublish && folderToPublish !== ".") {
		pathCandidates.push(
			...pathCandidates
				.filter((candidate) => candidate.startsWith(`${folderToPublish}/`))
				.map((candidate) => candidate.slice(folderToPublish.length + 1)),
		);
	}

	return [...new Set(pathCandidates.filter(Boolean))];
}

function withMarkdownExtension(pathName: string) {
	return /\.(md|markdown)$/i.test(pathName) ? normalizePathSegments(pathName) : `${pathName}.md`;
}

function dirname(pathName: string) {
	const normalizedPath = normalizePathSegments(pathName);
	const parts = normalizedPath.split("/");
	parts.pop();
	return parts.join("/");
}

function joinPaths(...paths: string[]) {
	return normalizePathSegments(paths.filter(Boolean).join("/"));
}

function normalizeWikilinkPath(value: string) {
	return normalizePathSegments(value);
}

function normalizePathSegments(value: string) {
	const segments: string[] = [];

	for (const segment of value.replace(/\\/g, "/").replace(/^\/+/, "").split("/")) {
		if (segment === "" || segment === ".") {
			continue;
		}
		if (segment === "..") {
			if (segments.length > 0 && segments.at(-1) !== "..") {
				segments.pop();
			} else {
				segments.push(segment);
			}
			continue;
		}
		segments.push(segment);
	}

	return segments.join("/");
}

function removeEmptyProperties(adf: JSONDocNode) {
	return traverse(adf, {
		any: (node, _parent) => {
			if (
				node.content &&
				node.content.filter((m) => !(m === undefined || m === null)).length === 0
			) {
				delete node.content;
			}

			try {
				if (
					node.marks &&
					node.marks.filter((m) => !(m === undefined || m === null)).length === 0
				) {
					delete node.marks;
				}
			} catch (e: unknown) {
				Effect.runSync(Console.warn({ marks: node.marks, e }));
			}
			return node;
		},
	}) as JSONDocNode;
}

function mergeTextNodes(adf: JSONDocNode) {
	let result = removeEmptyProperties(adf);

	result = traverse(result, {
		paragraph: (node, _parent) => {
			if (
				node?.content === undefined ||
				node.content.filter((m) => !(m === undefined || m === null)).length === 0
			) {
				return node;
			}
			const processedContent: Array<ADFEntity | undefined> = [];
			for (const currentNode of node.content) {
				const previousNode = processedContent.at(-1);
				if (
					previousNode?.type === "text" &&
					currentNode?.type === "text" &&
					marksEqual(previousNode.marks, currentNode.marks)
				) {
					previousNode.text = (previousNode.text ?? "") + (currentNode.text ?? "");
				} else {
					processedContent.push(currentNode);
				}
			}

			if (processedContent.length > 0) {
				node.content = processedContent;
			}

			return node;
		},
	}) as JSONDocNode;

	return result;
}
