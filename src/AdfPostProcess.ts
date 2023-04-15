import { traverse } from "@atlaskit/adf-utils/traverse";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ConfluenceAdfFile, ConfluenceNode } from "./Publisher";
import { MyPluginSettings } from "./Settings";

export function prepareAdf(
	confluencePagesToPublish: ConfluenceNode[],
	settings: MyPluginSettings
) {
	const fileToPageIdMap: Record<string, ConfluenceAdfFile> = {};

	confluencePagesToPublish.forEach((node) => {
		fileToPageIdMap[node.file.fileName] = node.file;
	});

	confluencePagesToPublish.forEach((node) => {
		node.file.contents = traverse(node.file.contents, {
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
							node.marks.remove(node.marks[0]);
						}
						return node;
					}
				}
			},
			table: (node, _parent) => {
				if (
					node.attrs &&
					"isNumberColumnEnabled" in node.attrs &&
					node.attrs["isNumberColumnEnabled"] === false
				) {
					delete node.attrs["isNumberColumnEnabled"];
				}
				return node;
			},
			tableRow: (node, _parent) => {
				return node;
			},
			tableHeader: (node, _parent) => {
				node.attrs = { colspan: 1, rowspan: 1, colwidth: [340] };
				return node;
			},
			tableCell: (node, _parent) => {
				node.attrs = { colspan: 1, rowspan: 1, colwidth: [340] };
				return node;
			},
		}) as JSONDocNode;
	});
}
