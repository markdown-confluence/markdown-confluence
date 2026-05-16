import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { afterEach, expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { ConfluenceSettings } from "./Settings";
import { RuntimeEnvironmentService, runEffect } from "./effects";
import { loadMarkdownWorkspace } from "./MarkdownWorkspace";

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
		}),
	);

	const file = await Effect.runPromise(workspace.loadMarkdownFile(filePaths.absolutePath));
	expect(file.frontmatter["connie-publish"]).toBe(true);
	expect(String(file.frontmatter["connie-page-id"])).toBe("123456");
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
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "123456",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};
