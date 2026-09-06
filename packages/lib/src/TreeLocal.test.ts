import { Path } from "effect/Path";
import { expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { runEffect } from "./effects";
import { MarkdownFile } from "./MarkdownWorkspace";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";
import { createFolderStructure } from "./TreeLocal";

test("uses the containing directory as the root for one markdown file", async () => {
	const result = await runEffect(
		Effect.gen(function* () {
			const filesystemPath = yield* Path;
			const singleFilePath = filesystemPath.join(
				filesystemPath.sep,
				"content",
				"docs",
				"only-page.md",
			);
			const singleMarkdownFile = createMarkdownFile(filesystemPath, singleFilePath);

			return {
				expectedFilePath: singleFilePath,
				expectedRootPath: filesystemPath.join(filesystemPath.sep, "content", "docs"),
				tree: createFolderStructure([singleMarkdownFile], testSettings),
			};
		}),
	);

	expect(result.tree.name).toBe(result.expectedRootPath);
	expect(result.tree.children.map((child) => child.name)).toEqual(["only-page.md"]);
	expect(result.tree.children[0]?.file?.absoluteFilePath).toBe(result.expectedFilePath);
});

test("preserves nested synthetic folder paths", async () => {
	const result = await runEffect(
		Effect.gen(function* () {
			const filesystemPath = yield* Path;
			const tree = createFolderStructure(
				[
					createMarkdownFile(
						filesystemPath,
						filesystemPath.join("docs", "section", "subsection", "page.md"),
					),
					createMarkdownFile(filesystemPath, filesystemPath.join("docs", "sibling.md")),
				],
				testSettings,
			);

			return {
				expectedSectionPath: filesystemPath.join("docs", "section"),
				expectedSubsectionPath: filesystemPath.join("docs", "section", "subsection"),
				tree,
			};
		}),
	);
	const section = result.tree.children.find((child) => child.name === "section");
	const subsection = section?.children.find((child) => child.name === "subsection");

	expect(result.tree.name).toBe("docs");
	expect(section?.file?.absoluteFilePath).toBe(result.expectedSectionPath);
	expect(subsection?.file?.absoluteFilePath).toBe(result.expectedSubsectionPath);
});

test("uses folder names for README folder notes without explicit titles", async () => {
	const result = await runEffect(
		Effect.gen(function* () {
			const filesystemPath = yield* Path;
			const tree = createFolderStructure(
				[
					createMarkdownFile(
						filesystemPath,
						filesystemPath.join("docs", "folder-one", "README.md"),
					),
					createMarkdownFile(
						filesystemPath,
						filesystemPath.join("docs", "folder-two", "README.md"),
					),
				],
				testSettings,
			);

			return tree;
		}),
	);

	expect(result.children.map((child) => child.file?.pageTitle)).toEqual([
		"folder-one",
		"folder-two",
	]);
});

test("preserves explicit README folder note titles", async () => {
	const result = await runEffect(
		Effect.gen(function* () {
			const filesystemPath = yield* Path;
			const tree = createFolderStructure(
				[
					createMarkdownFile(
						filesystemPath,
						filesystemPath.join("docs", "folder-one", "README.md"),
						{
							contents: "# Explicit Title",
							frontmatter: { "connie-title": "Explicit Title" },
						},
					),
					createMarkdownFile(filesystemPath, filesystemPath.join("docs", "sibling.md")),
				],
				testSettings,
			);

			return tree;
		}),
	);

	expect(result.children[0]?.file?.pageTitle).toBe("Explicit Title");
});

test("allows duplicate page titles when every duplicate has an explicit page id", async () => {
	const tree = await runEffect(
		Effect.gen(function* () {
			const filesystemPath = yield* Path;
			return createFolderStructure(
				[
					createMarkdownFile(filesystemPath, filesystemPath.join("docs", "one.md"), {
						frontmatter: {
							"connie-title": "Shared Title",
							"connie-page-id": "111",
						},
					}),
					createMarkdownFile(filesystemPath, filesystemPath.join("docs", "two.md"), {
						frontmatter: {
							"connie-title": "Shared Title",
							"connie-page-id": "222",
						},
					}),
				],
				testSettings,
			);
		}),
	);

	expect(tree.children.map((child) => child.file?.pageTitle)).toEqual([
		"Shared Title",
		"Shared Title",
	]);
});

test("rejects duplicate page titles without explicit page ids", async () => {
	await expect(
		runEffect(
			Effect.gen(function* () {
				const filesystemPath = yield* Path;
				return createFolderStructure(
					[
						createMarkdownFile(filesystemPath, filesystemPath.join("docs", "one.md"), {
							frontmatter: { "connie-title": "Shared Title" },
						}),
						createMarkdownFile(filesystemPath, filesystemPath.join("docs", "two.md"), {
							frontmatter: { "connie-title": "Shared Title" },
						}),
					],
					testSettings,
				);
			}),
		),
	).rejects.toThrow('Page title "Shared Title" is not unique across all files.');
});

function createMarkdownFile(
	filesystemPath: Path,
	absoluteFilePath: string,
	overrides: Partial<MarkdownFile> = {},
): MarkdownFile {
	const parsedFilePath = filesystemPath.parse(absoluteFilePath);

	return {
		folderName: filesystemPath.basename(parsedFilePath.dir),
		absoluteFilePath,
		fileName: filesystemPath.basename(absoluteFilePath),
		contents: `# ${parsedFilePath.name}`,
		pageTitle: parsedFilePath.name,
		frontmatter: {},
		...overrides,
	};
}

const testSettings: ConfluenceSettings = {
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "123456",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
};
