import { Path } from "effect/Path";
import { expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { runEffect } from "./effects";
import { MarkdownFile } from "./MarkdownWorkspace";
import { ConfluenceSettings } from "./Settings";
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

function createMarkdownFile(filesystemPath: Path, absoluteFilePath: string): MarkdownFile {
	const parsedFilePath = filesystemPath.parse(absoluteFilePath);

	return {
		folderName: filesystemPath.basename(parsedFilePath.dir),
		absoluteFilePath,
		fileName: filesystemPath.basename(absoluteFilePath),
		contents: `# ${parsedFilePath.name}`,
		pageTitle: parsedFilePath.name,
		frontmatter: {},
	};
}

const testSettings: ConfluenceSettings = {
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "123456",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};
