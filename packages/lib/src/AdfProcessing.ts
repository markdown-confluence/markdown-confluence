import { traverse } from "@atlaskit/adf-utils/traverse";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ConfluenceAdfFile, ConfluenceNode } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
import { marksEqual } from "./AdfEqual";
import { ADFEntity, ADFEntityMark } from "@atlaskit/adf-utils/types";
import { p, tr } from "@atlaskit/adf-utils/builders";

export function prepareAdfToUpload(
	confluencePagesToPublish: ConfluenceNode[],
	settings: ConfluenceSettings
) {
	const fileToPageIdMap: Record<string, ConfluenceAdfFile> = {};

	confluencePagesToPublish.forEach((node) => {
		fileToPageIdMap[node.file.fileName] = node.file;
	});

	confluencePagesToPublish.forEach((confluenceNode) => {
		let result = confluenceNode.file.contents;

		if (result.content.length === 0) {
			result.content = [p()];
		}

		result = processWikilinkToActualLink(result, fileToPageIdMap, settings);

		result = mergeTextNodes(result);

		confluenceNode.file.contents = result;
	});
}

function processWikilinkToActualLink(
	adf: JSONDocNode,
	fileToPageIdMap: Record<string, ConfluenceAdfFile>,
	settings: ConfluenceSettings
) {
	return traverse(adf, {
		text: (node, _parent) => {
			if (
				node.marks &&
				node.marks[0].type === "link" &&
				node.marks[0].attrs
			) {
				if (
					typeof node.marks[0].attrs.href === "string" &&
					node.marks[0].attrs.href.startsWith("wikilink")
				) {
					const wikilinkUrl = new URL(node.marks[0].attrs.href);
					const pagename = `${wikilinkUrl.pathname}.md`;

					const linkPage = fileToPageIdMap[pagename];
					if (linkPage) {
						const confluenceUrl = `${settings.confluenceBaseUrl}/wiki/spaces/${linkPage.spaceKey}/pages/${linkPage.pageId}${wikilinkUrl.hash}`;
						node.marks[0].attrs.href = confluenceUrl;
						if (node.text === wikilinkUrl.pathname) {
							node.type = "inlineCard";
							node.attrs = {
								url: node.marks[0].attrs.href,
							};
							delete node.marks;
							delete node.text;
							return node;
						}
					} else {
						delete node.marks[0];
					}
					return node;
				}
			}
		},
	}) as JSONDocNode;
}

function removeEmptyProperties(adf: JSONDocNode) {
	return traverse(adf, {
		any: (node, _parent) => {
			if (
				node.content &&
				node.content.filter((m) => !(m === undefined || m === null))
					.length === 0
			) {
				delete node.content;
			}

			try {
				if (
					node.marks &&
					node.marks.filter((m) => !(m === undefined || m === null))
						.length === 0
				) {
					delete node.marks;
				}
			} catch (e: unknown) {
				console.log({ marks: node.marks, e });
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
				node.content.filter((m) => !(m === undefined || m === null))
					.length === 0
			) {
				return node;
			}
			const processedContent: Array<ADFEntity | undefined> = [];
			const indexToSkip: number[] = [];
			const nodesToCheck = node.content.length ?? 0;
			for (let index = 0; index < nodesToCheck; index++) {
				if (indexToSkip.includes(index)) {
					continue;
				}

				const currentNode = node.content[index];
				const nextNode = node.content[index + 1];

				if (
					nextNode === undefined ||
					currentNode === undefined ||
					currentNode.type !== "text" ||
					nextNode.type !== "text"
				) {
					processedContent.push(currentNode);
					continue;
				}

				for (
					let lookAheadIndex = index + 1;
					lookAheadIndex < nodesToCheck;
					lookAheadIndex++
				) {
					const futureNode = node.content[lookAheadIndex];

					if (marksEqual(currentNode?.marks, futureNode?.marks)) {
						currentNode.text =
							(currentNode.text ?? "") + (futureNode?.text ?? "");
						indexToSkip.push(lookAheadIndex);
					} else {
						break;
					}
				}

				processedContent.push(currentNode);
			}

			if (processedContent.length > 0) {
				node.content = processedContent;
			}

			return node;
		},
	}) as JSONDocNode;

	return result;
}

export function removeInlineComments(adf: JSONDocNode) {
	let result = traverse(adf, {
		text: (node, _parent) => {
			if (node.marks) {
				node.marks = node.marks.reduce((prev, curr) => {
					if (
						curr.type === "annotation" &&
						curr.attrs?.annotationType === "inlineComment"
					) {
						return prev;
					}
					return [...prev, curr];
				}, [] as ADFEntityMark[]);
			}
			return node;
		},
	}) as JSONDocNode;

	result = mergeTextNodes(result);

	return result;
}
