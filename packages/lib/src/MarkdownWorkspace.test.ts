import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { afterEach, expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";
import { runEffect } from "./effects";
import {
	loadMarkdownWorkspace,
	shouldPublishMarkdownFile,
	makeMarkdownWorkspaceEffect,
} from "./MarkdownWorkspace";
import {
	MarkdownSourceTransformerService,
	MarkdownPublishFilter,
	type MarkdownSourceTransformer,
} from "./MarkdownSourceTransformer";

test("folder selection respects directory boundaries on all platforms", () => {
	const settings = { ...DEFAULT_SETTINGS, folderToPublish: "docs" };
	expect(shouldPublishMarkdownFile("docs/page.md", {}, settings)).toBe(true);
	expect(shouldPublishMarkdownFile("docs\\page.md", {}, settings)).toBe(true);
	expect(shouldPublishMarkdownFile("docs-private/page.md", {}, settings)).toBe(false);
	expect(shouldPublishMarkdownFile("docs.md", {}, settings)).toBe(false);
});

let tmpRoot: string | undefined;

afterEach(async () => {
	await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;

			if (tmpRoot) {
				yield* fs.remove(tmpRoot, { recursive: true, force: true });
				tmpRoot = undefined;
			}
		}),
	);
});

async function loadMarkdownWorkspaceFrom(workingDirectory: string, settings: ConfluenceSettings) {
	return runEffect(
		Effect.gen(function* () {
			const path = yield* Path;
			// Model relative paths without changing the process cwd shared by test workers.
			return yield* makeMarkdownWorkspaceEffect(settings).pipe(
				Effect.provideService(Path, {
					...path,
					resolve: (...segments) => path.resolve(workingDirectory, ...segments),
				}),
			);
		}),
	);
}

test("matches folderToPublish under a relative contentRoot", async () => {
	const expectedFilePath = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;

			yield* fs.makeDirectory(path.join(workspaceRoot, "phil", "thingy"), {
				recursive: true,
			});
			yield* fs.writeFileString(path.join(workspaceRoot, "phil", "index.md"), "# Index");
			yield* fs.writeFileString(
				path.join(workspaceRoot, "phil", "thingy", "mydude.md"),
				"# My Dude",
			);

			return path.join("thingy", "mydude.md");
		}),
	);

	const workspace = await loadMarkdownWorkspaceFrom(tmpRoot!, {
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

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;

			yield* fs.makeDirectory(path.join(workspaceRoot, "Notes"), { recursive: true });
			yield* fs.writeFileString(
				path.join(workspaceRoot, "Notes", "publish-me.md"),
				"---\ntags:\n  - public\n---\n# Public",
			);
			yield* fs.writeFileString(
				path.join(workspaceRoot, "Notes", "skip-me.md"),
				"---\ntags:\n  - public\nconnie-publish: false\n---\n# Private",
			);
			yield* fs.writeFileString(
				path.join(workspaceRoot, "Notes", "untagged.md"),
				"# Untagged",
			);

			return path.join("Notes", "publish-me.md");
		}),
	);

	const workspace = await loadMarkdownWorkspaceFrom(tmpRoot!, {
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

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;

			yield* fs.makeDirectory(path.join(workspaceRoot, "Confluence Pages"), {
				recursive: true,
			});
			yield* fs.makeDirectory(path.join(workspaceRoot, "Notes"), { recursive: true });
			yield* fs.writeFileString(
				path.join(workspaceRoot, "Confluence Pages", "page.md"),
				"# Page\n\nBefore\n\n![[Notes/embed]]\n\nAfter",
			);
			yield* fs.writeFileString(
				path.join(workspaceRoot, "Notes", "embed.md"),
				"---\ntags:\n  - private\n---\n## Embedded content",
			);

			return path.join("Confluence Pages", "page.md");
		}),
	);

	const workspace = await loadMarkdownWorkspaceFrom(tmpRoot!, {
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

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;

			yield* fs.makeDirectory(path.join(workspaceRoot, "src", "development"), {
				recursive: true,
			});
			yield* fs.writeFileString(
				path.join(workspaceRoot, "src", "development", "page.md"),
				"# Page",
			);

			return {
				updatePath: path.join("src", "development", "page.md"),
				absolutePath: path.join(workspaceRoot, "src", "development", "page.md"),
			};
		}),
	);

	const workspace = await loadMarkdownWorkspaceFrom(tmpRoot!, {
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

			const workspaceRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-" });
			tmpRoot = workspaceRoot;

			yield* fs.makeDirectory(path.join(workspaceRoot, "src", "development"), {
				recursive: true,
			});
			yield* fs.writeFileString(
				path.join(workspaceRoot, "src", "development", "page.md"),
				"# Page",
			);

			return path.join(workspaceRoot, "src", "development", "page.md");
		}),
	);

	const workspace = await loadMarkdownWorkspaceFrom(tmpRoot!, {
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

test.each([
	{ folderToPublish: ".", tagsToPublish: "" },
	{ folderToPublish: "Elsewhere", tagsToPublish: "public" },
])("persists explicit opt-outs for selection by %j", async (selection) => {
	const filePath = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			tmpRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-opt-out-" });
			const filePath = path.join(tmpRoot, "page.md");
			yield* fs.writeFileString(
				filePath,
				"---\ntags: [public]\nconnie-publish: true\nconnie-dont-change-parent-page: true\nconnie-page-id: old\ncustom: retained\n---\n# Page\n",
			);
			return filePath;
		}),
	);
	const settings = { ...testSettings, ...selection, contentRoot: tmpRoot! };
	const workspace = await loadMarkdownWorkspace(settings);
	await Effect.runPromise(
		workspace.updateMarkdownValues(filePath, {
			publish: false,
			dontChangeParentPageId: false,
			pageId: undefined,
		}),
	);
	const reloaded = await loadMarkdownWorkspace(settings);
	const file = await Effect.runPromise(reloaded.loadMarkdownFile(filePath));
	expect(file.frontmatter).toMatchObject({
		"connie-publish": false,
		"connie-dont-change-parent-page": false,
		custom: "retained",
	});
	expect(file.frontmatter).not.toHaveProperty("connie-page-id");
	expect(file.contents).toContain("# Page");
	expect(await Effect.runPromise(reloaded.getMarkdownFilesToUpload)).toEqual([]);
	await Effect.runPromise(reloaded.updateMarkdownValues(filePath, { publish: undefined }));
	expect(await Effect.runPromise(reloaded.getMarkdownFilesToUpload)).toHaveLength(1);
});

async function transformedWorkspace(
	files: Record<string, string>,
	transformer: MarkdownSourceTransformer,
) {
	return runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			tmpRoot = yield* fs.makeTempDirectory({ prefix: "markdown-confluence-source-hook-" });
			for (const [name, content] of Object.entries(files)) {
				const target = path.join(tmpRoot, name);
				yield* fs.makeDirectory(path.dirname(target), { recursive: true });
				yield* fs.writeFileString(target, content);
			}
			return yield* makeMarkdownWorkspaceEffect({
				...testSettings,
				contentRoot: tmpRoot,
				folderToPublish: "Publish",
			});
		}).pipe(Effect.provideService(MarkdownSourceTransformerService, transformer)),
	);
}

test("source transforms preserve original queries through frontmatter write-back and raw reads", async () => {
	const source = "```dataview\nTABLE authors\n```";
	const workspace = await transformedWorkspace(
		{ "Publish/Note.md": source },
		{
			transform: () => Effect.succeed("| Authors |\n| --- |\n| Ada |"),
		},
	);
	const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);
	expect(files[0]?.contents).toContain("| Ada |");
	await Effect.runPromise(workspace.updateMarkdownValues("Publish/Note.md", { pageId: "123" }));
	const saved = await runEffect(
		Effect.gen(function* () {
			return yield* (yield* FileSystem).readFileString(`${tmpRoot}/Publish/Note.md`);
		}),
	);
	expect(saved).toContain(source);
	expect(saved).toContain("connie-page-id:");
	expect(saved).not.toContain("| Ada |");
	expect(await Effect.runPromise(workspace.readText("Note.md", "Publish/Note.md"))).toContain(
		source,
	);
});

test("selected notes and included sections are transformed with their original context before embed expansion", async () => {
	const visited: string[] = [];
	const workspace = await transformedWorkspace(
		{
			"Publish/Note.md": "SOURCE",
			"Notes/Included.md": "# Keep\nEMBED QUERY\n# Skip\nBAD QUERY",
			"Notes/Other.md": "BAD QUERY",
		},
		{
			transform: (markdown, context) => {
				visited.push(context.sourcePath);
				if (markdown.includes("BAD QUERY"))
					return Effect.fail(new Error("Must not evaluate unrelated content"));
				return Effect.succeed(
					markdown
						.replace("SOURCE", "![[Notes/Included#Keep]]")
						.replace("EMBED QUERY", `From ${context.sourcePath}`),
				);
			},
		},
	);
	const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);
	expect(visited).toEqual(["Publish/Note.md", "Notes/Included.md"]);
	expect(files[0]?.contents).toContain("From Notes/Included.md");
	expect(files[0]?.contents).not.toContain("EMBED QUERY");
});

test("single-note publication avoids other queries while retaining their page mapping", async () => {
	const visited: string[] = [];
	const workspace = await transformedWorkspace(
		{
			"Publish/One.md": "One",
			"Publish/Two.md": "![[Notes/Title]]",
			"Notes/Title.md": "# Embedded title",
		},
		{
			transform: (markdown, context) => {
				visited.push(context.sourcePath);
				return context.sourcePath.endsWith("Two.md")
					? Effect.fail(new Error("Invalid query"))
					: Effect.succeed(markdown);
			},
		},
	);
	const files = await Effect.runPromise(
		workspace.getMarkdownFilesToUpload.pipe(
			Effect.provideService(MarkdownPublishFilter, "Publish/One.md"),
		),
	);
	expect(files).toHaveLength(2);
	expect(files.find((file) => file.fileName === "Two.md")?.contents).toContain(
		"# Embedded title",
	);
	expect(visited).toEqual(["Publish/One.md"]);
	await expect(Effect.runPromise(workspace.getMarkdownFilesToUpload)).rejects.toThrow(
		"Invalid query",
	);
});
