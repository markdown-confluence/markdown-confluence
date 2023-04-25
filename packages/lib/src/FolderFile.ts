import { JSONDocNode } from "@atlaskit/editor-json-transformer";

export const folderFile: JSONDocNode = {
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: [
				{
					type: "inlineExtension",
					attrs: {
						extensionType: "com.atlassian.confluence.macro.core",
						extensionKey: "pagetree",
						parameters: {
							macroParams: {
								root: { value: "@self" },
								startDepth: { value: "1" },
								sort: { value: "natural" },
								searchBox: { value: "true" },
							},
							macroMetadata: {
								macroId: {
									value: "8f7f256e2695ce2b3066b14c55bb4a84",
								},
								schemaVersion: { value: "1" },
								title: "Page Tree",
							},
						},
						localId: "66e965e0-1323-4e94-8094-88df12efedfc",
					},
				},
			],
		},
	],
	version: 1,
};
