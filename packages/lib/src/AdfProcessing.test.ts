import { expect, test } from "@effect/vitest";
import { TextDefinition } from "@atlaskit/adf-schema";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { prepareAdfToUpload } from "./AdfProcessing";
import { ConfluenceAdfFile, ConfluenceNode } from "./Publisher";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";

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

test("resolves relative markdown links from the current file directory", () => {
	const pages = [
		createNode({
			fileName: "README.md",
			absoluteFilePath: "Confluence Pages/docs/guidebook/README.md",
			contents: docWithLink("Context", "wikilinks:context/README"),
		}),
		createNode({
			fileName: "README.md",
			absoluteFilePath: "Confluence Pages/docs/guidebook/context/README.md",
			pageId: "222222",
			spaceKey: "SPACE",
		}),
	];

	prepareAdfToUpload(pages, testSettings);

	const link = pages[0]!.file.contents.content[0]!.content![0] as TextDefinition;
	expect(link.marks?.[0]?.attrs?.href).toBe(
		"https://example.atlassian.net/wiki/spaces/SPACE/pages/222222",
	);
});

test("resolves same-page heading wikilinks to the current page", () => {
	const pages = [
		createNode({
			fileName: "source.md",
			absoluteFilePath: "Confluence Pages/source.md",
			pageId: "111111",
			spaceKey: "SPACE",
			contents: docWithLink("Overview", "wikilinks:#Overview"),
		}),
	];

	prepareAdfToUpload(pages, testSettings);

	const link = pages[0]!.file.contents.content[0]!.content![0] as TextDefinition;
	expect(link.marks?.[0]?.attrs?.href).toBe(
		"https://example.atlassian.net/wiki/spaces/SPACE/pages/111111#Overview",
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
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceSiteUrl: "",
	confluenceParentId: "1",
	confluenceAuthType: "basic",
	atlassianUserName: "test@example.com",
	atlassianApiToken: "token",
	atlassianClientId: "",
	atlassianClientSecret: "",
	folderToPublish: "Confluence Pages",
	tagsToPublish: "",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
};
