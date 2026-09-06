import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { afterEach, expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";
import { RuntimeEnvironmentService, runEffect } from "./effects";
import { loadMarkdownWorkspace, shouldPublishMarkdownFile } from "./MarkdownWorkspace";

test("folder selection respects directory boundaries on all platforms", () => {
	const settings = { ...DEFAULT_SETTINGS, folderToPublish: "docs" };
	expect(shouldPublishMarkdownFile("docs/page.md", {}, settings)).toBe(true);
	expect(shouldPublishMarkdownFile("docs\\page.md", {}, settings)).toBe(true);
	expect(shouldPublishMarkdownFile("docs-private/page.md", {}, settings)).toBe(false);
	expect(shouldPublishMarkdownFile("docs.md", {}, settings)).toBe(false);
});

let tmpRoot: string | undefined;
let originalWorkingDirectory: string | undefined;

afterEach(async () => {
	await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const runtimeEnvironment = yield* RuntimeEnvironmentService;

			if (originalWorkingDirectory) {
				yield* runtimeEnvironment.chdir(originalWorkingDirectory);
				originalWorkingDirectory = undefined;
			}

			if (tmpRoot) {
				yield* fs.remove(tmpRoot, { recursive: true, force: true });
				tmpRoot = undefined;
			}
		}),
	);
});

test("matches folderToPublish under a relative contentRoot", async () => {
	const expectedFilePath = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const runtimeEnvironment = yield* RuntimeEnvironmentService;

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;
			originalWorkingDirectory = yield* runtimeEnvironment.cwd;
			yield* runtimeEnvironment.chdir(workspaceRoot);

			yield* fs.makeDirectory(path.join("phil", "thingy"), { recursive: true });
			yield* fs.writeFileString(path.join("phil", "index.md"), "# Index");
			yield* fs.writeFileString(path.join("phil", "thingy", "mydude.md"), "# My Dude");

			return path.join("thingy", "mydude.md");
		}),
	);

	const workspace = await loadMarkdownWorkspace({
		...testSettings,
		contentRoot: "./phil/",
		folderToPublish: "thingy",
	});

	const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);

	expect(files.map((file) => file.absoluteFilePath)).toEqual([expectedFilePath]);
});

test("matches tagsToPublish outside the configured publish folder", async () => {
	const expectedFilePath = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const runtimeEnvironment = yield* RuntimeEnvironmentService;

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;
			originalWorkingDirectory = yield* runtimeEnvironment.cwd;
			yield* runtimeEnvironment.chdir(workspaceRoot);

			yield* fs.makeDirectory("Notes", { recursive: true });
			yield* fs.writeFileString(
				path.join("Notes", "publish-me.md"),
				"---\ntags:\n  - public\n---\n# Public",
			);
			yield* fs.writeFileString(
				path.join("Notes", "skip-me.md"),
				"---\ntags:\n  - public\nconnie-publish: false\n---\n# Private",
			);
			yield* fs.writeFileString(path.join("Notes", "untagged.md"), "# Untagged");

			return path.join("Notes", "publish-me.md");
		}),
	);

	const workspace = await loadMarkdownWorkspace({
		...testSettings,
		folderToPublish: "Confluence Pages",
		tagsToPublish: "public",
	});

	const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);

	expect(files.map((file) => file.absoluteFilePath)).toEqual([expectedFilePath]);
});

test("expands Obsidian markdown embeds from outside the publish folder", async () => {
	const expectedFilePath = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const runtimeEnvironment = yield* RuntimeEnvironmentService;

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;
			originalWorkingDirectory = yield* runtimeEnvironment.cwd;
			yield* runtimeEnvironment.chdir(workspaceRoot);

			yield* fs.makeDirectory("Confluence Pages", { recursive: true });
			yield* fs.makeDirectory("Notes", { recursive: true });
			yield* fs.writeFileString(
				path.join("Confluence Pages", "page.md"),
				"# Page\n\nBefore\n\n![[Notes/embed]]\n\nAfter",
			);
			yield* fs.writeFileString(
				path.join("Notes", "embed.md"),
				"---\ntags:\n  - private\n---\n## Embedded content",
			);

			return path.join("Confluence Pages", "page.md");
		}),
	);

	const workspace = await loadMarkdownWorkspace({
		...testSettings,
		folderToPublish: "Confluence Pages",
	});

	const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);

	expect(files).toHaveLength(1);
	expect(files[0]?.absoluteFilePath).toBe(expectedFilePath);
	expect(files[0]?.contents).toContain("## Embedded content");
	expect(files[0]?.contents).not.toContain("tags:");
});

test("updates markdown values for a cwd-relative file path inside contentRoot", async () => {
	const filePaths = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const runtimeEnvironment = yield* RuntimeEnvironmentService;

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;
			originalWorkingDirectory = yield* runtimeEnvironment.cwd;
			yield* runtimeEnvironment.chdir(workspaceRoot);

			yield* fs.makeDirectory(path.join("src", "development"), { recursive: true });
			yield* fs.writeFileString(path.join("src", "development", "page.md"), "# Page");

			return {
				updatePath: path.join("src", "development", "page.md"),
				absolutePath: path.join(workspaceRoot, "src", "development", "page.md"),
			};
		}),
	);

	const workspace = await loadMarkdownWorkspace({
		...testSettings,
		contentRoot: "./src/",
	});

	await Effect.runPromise(
		workspace.updateMarkdownValues(filePaths.updatePath, {
			publish: true,
			pageId: "123456",
			pageUrl: "https://example.atlassian.net/wiki/spaces/SPACE/pages/123456/",
		}),
	);

	const file = await Effect.runPromise(workspace.loadMarkdownFile(filePaths.absolutePath));
	expect(file.frontmatter["connie-publish"]).toBe(true);
	expect(String(file.frontmatter["connie-page-id"])).toBe("123456");
	expect(file.frontmatter["connie-page-url"]).toBe(
		"https://example.atlassian.net/wiki/spaces/SPACE/pages/123456/",
	);
});

test("updates markdown values for an absolute file path inside contentRoot", async () => {
	const filePath = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const runtimeEnvironment = yield* RuntimeEnvironmentService;

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;
			originalWorkingDirectory = yield* runtimeEnvironment.cwd;
			yield* runtimeEnvironment.chdir(workspaceRoot);

			yield* fs.makeDirectory(path.join("src", "development"), { recursive: true });
			yield* fs.writeFileString(path.join("src", "development", "page.md"), "# Page");

			return path.join(workspaceRoot, "src", "development", "page.md");
		}),
	);

	const workspace = await loadMarkdownWorkspace({
		...testSettings,
		contentRoot: "./src/",
	});

	await Effect.runPromise(
		workspace.updateMarkdownValues(filePath, {
			publish: true,
			pageId: "234567",
		}),
	);

	const file = await Effect.runPromise(workspace.loadMarkdownFile(filePath));
	expect(file.frontmatter["connie-publish"]).toBe(true);
	expect(String(file.frontmatter["connie-page-id"])).toBe("234567");
});

const testSettings: ConfluenceSettings = {
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceSiteUrl: "",
	confluenceParentId: "123456",
	confluenceAuthType: "basic",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	atlassianClientId: "",
	atlassianClientSecret: "",
	folderToPublish: ".",
	tagsToPublish: "",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
};
