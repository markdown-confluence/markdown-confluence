import { expect, test } from "@effect/vitest";
import { TextDefinition } from "@atlaskit/adf-schema";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { prepareAdfToUpload } from "./AdfProcessing";
import { ConfluenceAdfFile, ConfluenceNode } from "./Publisher";
import { ConfluenceSettings } from "./Settings";

test("resolves wikilinks that include a path under the publish root", () => {
	const pages = [
		createNode({
			fileName: "source.md",
			absoluteFilePath: "Confluence Pages/source.md",
			contents: docWithLink("Read this", "wikilinks:confluence/note/test"),
		}),
		createNode({
			fileName: "test.md",
			absoluteFilePath: "Confluence Pages/confluence/note/test.md",
			pageId: "123456",
			spaceKey: "SPACE",
		}),
	];

	prepareAdfToUpload(pages, testSettings);

	const link = pages[0]!.file.contents.content[0]!.content![0] as TextDefinition;
	expect(link.marks?.[0]?.attrs?.href).toBe(
		"https://example.atlassian.net/wiki/spaces/SPACE/pages/123456",
	);
});

function docWithLink(text: string, href: string): JSONDocNode {
	return {
		version: 1,
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text,
						marks: [
							{
								type: "link",
								attrs: { href },
							},
						],
					},
				],
			},
		],
	} as JSONDocNode;
}

function createNode(file: Partial<ConfluenceAdfFile>): ConfluenceNode {
	const confluenceFile: ConfluenceAdfFile = {
		folderName: "",
		absoluteFilePath: "Confluence Pages/default.md",
		fileName: "default.md",
		contents: docWithLink("", ""),
		pageTitle: "Default",
		frontmatter: {},
		tags: [],
		dontChangeParentPageId: false,
		pageId: "654321",
		spaceKey: "SPACE",
		pageUrl: "",
		contentType: "page",
		blogPostDate: undefined,
		...file,
	};

	return {
		file: confluenceFile,
		version: 1,
		lastUpdatedBy: "tester",
		existingPageData: {
			adfContent: {
				version: 1,
				type: "doc",
				content: [],
			},
			pageTitle: confluenceFile.pageTitle,
			ancestors: [],
			contentType: "page",
		},
		ancestors: [],
	};
}

const testSettings: ConfluenceSettings = {
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "1",
	atlassianUserName: "test@example.com",
	atlassianApiToken: "token",
	folderToPublish: "Confluence Pages",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};
