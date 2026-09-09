import { afterEach, expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { runEffect } from "./effects";
import { DEFAULT_SETTINGS } from "./Settings";
import { makeMarkdownWorkspaceEffect, MarkdownWorkspaceService } from "./MarkdownWorkspace";
import { uploadFileEffect } from "./Attachments";
import type { RequiredConfluenceClient } from "./ConfluenceClient";

const temporaryRoots: string[] = [];
afterEach(async () => {
	await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			for (const directory of temporaryRoots.splice(0))
				yield* fs.remove(directory, { recursive: true, force: true });
		}),
	);
});

async function fixture() {
	return runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const directory = yield* fs.makeTempDirectory({ prefix: "confluence-containment-" });
			temporaryRoots.push(directory);
			const root = path.join(directory, "docs");
			yield* fs.makeDirectory(root);
			yield* fs.writeFileString(path.join(root, "page.md"), "# Safe page");
			yield* fs.writeFileString(path.join(directory, "outside.md"), "OUTSIDE_MARKER");
			const canonicalDirectory = yield* fs.realPath(directory);
			const canonicalRoot = yield* fs.realPath(root);
			const accesses: Array<{ operation: string; canonicalPath: string }> = [];
			const deniedAccesses: string[] = [];
			const contains = (parent: string, candidate: string) =>
				candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
			const guardDataAccess = (operation: string, filePath: string) =>
				Effect.gen(function* () {
					const absolute = path.resolve(filePath);
					if (!contains(directory, absolute) && !contains(canonicalDirectory, absolute)) {
						deniedAccesses.push(`${operation}: ${filePath}`);
						return yield* Effect.die(
							new Error("Test filesystem access escaped fixture"),
						);
					}
					const canonicalPath = yield* fs.realPath(absolute);
					if (!contains(canonicalRoot, canonicalPath)) {
						deniedAccesses.push(`${operation}: ${filePath}`);
						return yield* Effect.die(
							new Error("Test filesystem access reached denied data"),
						);
					}
					accesses.push({ operation, canonicalPath });
				});
			const guardedFs: FileSystem = {
				...fs,
				readFile: (filePath) =>
					guardDataAccess("readFile", filePath).pipe(
						Effect.andThen(fs.readFile(filePath)),
					),
				readFileString: (filePath, encoding) =>
					guardDataAccess("readFileString", filePath).pipe(
						Effect.andThen(fs.readFileString(filePath, encoding)),
					),
				readDirectory: (filePath, options) =>
					guardDataAccess("readDirectory", filePath).pipe(
						Effect.andThen(fs.readDirectory(filePath, options)),
					),
				writeFileString: (filePath, contents, options) =>
					guardDataAccess("writeFileString", filePath).pipe(
						Effect.andThen(fs.writeFileString(filePath, contents, options)),
					),
			};
			const createWorkspace = (
				contentRoot = root,
				workingDirectory?: string,
				folderToPublish = ".",
			) =>
				makeMarkdownWorkspaceEffect({
					...DEFAULT_SETTINGS,
					contentRoot,
					folderToPublish,
				}).pipe(
					Effect.provideService(FileSystem, guardedFs),
					Effect.provideService(
						Path,
						workingDirectory
							? {
									...path,
									resolve: (...segments) =>
										path.resolve(workingDirectory, ...segments),
								}
							: path,
					),
				);
			const workspace = yield* createWorkspace();
			return {
				fs,
				path,
				directory,
				root,
				workspace,
				createWorkspace,
				accesses,
				deniedAccesses,
				canonicalRoot,
			};
		}),
	);
}

test("rejects outside-root targets and reference origins for text, binary, direct load and writeback", async () => {
	const { workspace, directory, root, accesses, deniedAccesses } = await fixture();
	await expect(Effect.runPromise(workspace.readText("../outside.md", "page.md"))).rejects.toThrow(
		"contentRoot",
	);
	await expect(
		Effect.runPromise(workspace.readBinary("../outside.md", "page.md")),
	).rejects.toThrow("contentRoot");
	await expect(Effect.runPromise(workspace.readText("outside.md", "../page.md"))).rejects.toThrow(
		"contentRoot",
	);
	await expect(
		Effect.runPromise(workspace.loadMarkdownFile(`${directory}/outside.md`)),
	).rejects.toThrow("contentRoot");
	await expect(
		Effect.runPromise(
			workspace.updateMarkdownValues(`${root}/../outside.md`, { pageId: "123" }),
		),
	).rejects.toThrow("contentRoot");
	expect(accesses).toEqual([]);
	expect(deniedAccesses).toEqual([]);
});

test("attachment and text origins remain root-relative when cwd contains another copy of the page", async () => {
	const { fs, root, createWorkspace } = await fixture();
	await Effect.runPromise(fs.makeDirectory(`${root}/Work`));
	await Effect.runPromise(fs.writeFileString(`${root}/Work/page.md`, "# Other page"));
	await Effect.runPromise(fs.writeFileString(`${root}/snippet.puml`, "ROOT"));
	await Effect.runPromise(fs.writeFileString(`${root}/Work/snippet.puml`, "WRONG"));
	const workspace = await Effect.runPromise(createWorkspace(root, `${root}/Work`));
	expect(await Effect.runPromise(workspace.readText("snippet.puml", "page.md"))).toBe("ROOT");
	const binary = await Effect.runPromise(workspace.readBinary("snippet.puml", "page.md"));
	expect(binary && Buffer.from(binary.contents).toString()).toBe("ROOT");
});

test("never uploads a URI-decoded traversal target", async () => {
	const { workspace, accesses, deniedAccesses } = await fixture();
	let uploads = 0;
	const client = {
		contentAttachments: {
			createOrUpdateAttachments: async () => {
				uploads++;
				throw new Error("unexpected upload");
			},
		},
	} as unknown as RequiredConfluenceClient;
	await expect(
		Effect.runPromise(
			uploadFileEffect(client, "123", "page.md", "%2e%2e%2foutside.md", {}).pipe(
				Effect.provideService(MarkdownWorkspaceService, workspace),
			),
		),
	).rejects.toThrow("contentRoot");
	expect(uploads).toBe(0);
	expect(accesses.every((access) => access.operation === "readDirectory")).toBe(true);
	expect(deniedAccesses).toEqual([]);
});

test("basename fallback stops at the root", async () => {
	const { workspace, deniedAccesses } = await fixture();
	expect(await Effect.runPromise(workspace.readText("outside.md", "page.md"))).toBe(false);
	expect(deniedAccesses).toEqual([]);
});

test("rejects external symlink reads, discovery and metadata writes", async () => {
	const { workspace, fs, root, directory, accesses, deniedAccesses } = await fixture();
	await Effect.runPromise(fs.symlink(`${directory}/outside.md`, `${root}/linked.md`));
	await expect(Effect.runPromise(workspace.readBinary("linked.md", "page.md"))).rejects.toThrow(
		"contentRoot",
	);
	await expect(Effect.runPromise(workspace.getMarkdownFilesToUpload)).rejects.toThrow(
		"contentRoot",
	);
	await expect(
		Effect.runPromise(workspace.updateMarkdownValues(`${root}/linked.md`, { pageId: "123" })),
	).rejects.toThrow("contentRoot");
	expect(accesses.every((access) => access.operation === "readDirectory")).toBe(true);
	expect(deniedAccesses).toEqual([]);
	expect(await Effect.runPromise(fs.readFileString(`${directory}/outside.md`))).toBe(
		"OUTSIDE_MARKER",
	);
});

test("preserves inside-root sibling embeds and legitimate dot-prefixed files", async () => {
	const { workspace, fs, root } = await fixture();
	await Effect.runPromise(fs.makeDirectory(`${root}/Publish`));
	await Effect.runPromise(fs.writeFileString(`${root}/..notes.md`, "# Included"));
	await Effect.runPromise(fs.writeFileString(`${root}/Publish/page.md`, "![[../..notes.md]]"));
	const page = await Effect.runPromise(workspace.loadMarkdownFile(`${root}/Publish/page.md`));
	expect(page.contents).toContain("# Included");
	expect(await Effect.runPromise(workspace.readText("../..notes.md", "Publish/page.md"))).toBe(
		"# Included",
	);
});

test("rejects a sibling directory sharing the content root prefix before data access", async () => {
	const { workspace, fs, directory, accesses, deniedAccesses } = await fixture();
	const sibling = `${directory}/docs-private`;
	await Effect.runPromise(fs.makeDirectory(sibling));
	await Effect.runPromise(fs.writeFileString(`${sibling}/secret.md`, "PREFIX_MARKER"));
	await expect(
		Effect.runPromise(workspace.readBinary("../docs-private/secret.md", "page.md")),
	).rejects.toThrow("contentRoot");
	await expect(
		Effect.runPromise(workspace.loadMarkdownFile(`${sibling}/secret.md`)),
	).rejects.toThrow("contentRoot");
	await expect(
		Effect.runPromise(
			workspace.updateMarkdownValues(`${sibling}/secret.md`, { pageId: "123" }),
		),
	).rejects.toThrow("contentRoot");
	expect(accesses).toEqual([]);
	expect(deniedAccesses).toEqual([]);
	expect(await Effect.runPromise(fs.readFileString(`${sibling}/secret.md`))).toBe(
		"PREFIX_MARKER",
	);
});

test("rejects an external directory symlink before traversing or reading its contents", async () => {
	const { workspace, fs, directory, root, accesses, deniedAccesses } = await fixture();
	const outsideFolder = `${directory}/outside-folder`;
	await Effect.runPromise(fs.makeDirectory(outsideFolder));
	await Effect.runPromise(fs.writeFileString(`${outsideFolder}/secret.md`, "DIRECTORY_MARKER"));
	await Effect.runPromise(fs.symlink(outsideFolder, `${root}/linked-folder`));
	await expect(
		Effect.runPromise(workspace.readText("linked-folder/secret.md", "page.md")),
	).rejects.toThrow("contentRoot");
	await expect(Effect.runPromise(workspace.getMarkdownFilesToUpload)).rejects.toThrow(
		"contentRoot",
	);
	await expect(
		Effect.runPromise(
			workspace.updateMarkdownValues(`${root}/linked-folder/secret.md`, { pageId: "123" }),
		),
	).rejects.toThrow("contentRoot");
	expect(accesses.every((access) => access.operation === "readDirectory")).toBe(true);
	expect(deniedAccesses).toEqual([]);
	expect(await Effect.runPromise(fs.readFileString(`${outsideFolder}/secret.md`))).toBe(
		"DIRECTORY_MARKER",
	);
});

test("supports a symlinked root and in-root file links while keeping logical file names", async () => {
	const { fs, directory, root, createWorkspace, canonicalRoot, accesses, deniedAccesses } =
		await fixture();
	const rootLink = `${directory}/root-link`;
	await Effect.runPromise(fs.symlink(root, rootLink));
	await Effect.runPromise(fs.symlink(`${root}/page.md`, `${root}/linked.md`));
	const workspace = await Effect.runPromise(createWorkspace(rootLink));
	const page = await Effect.runPromise(workspace.loadMarkdownFile(`${rootLink}/linked.md`));
	expect(page.absoluteFilePath).toBe("linked.md");
	expect(page.contents).toBe("# Safe page");
	expect(await Effect.runPromise(workspace.readText("linked.md", "page.md"))).toBe("# Safe page");
	await Effect.runPromise(
		workspace.updateMarkdownValues(`${rootLink}/linked.md`, { pageId: "123" }),
	);
	expect(accesses.filter((access) => access.operation === "writeFileString")).toEqual([
		{ operation: "writeFileString", canonicalPath: `${canonicalRoot}/page.md` },
	]);
	expect(await Effect.runPromise(fs.readFileString(`${root}/page.md`))).toContain(
		"connie-page-id:",
	);
	expect(deniedAccesses).toEqual([]);
});

test("internal directory aliases and cycles are visited once per canonical directory", async () => {
	const { workspace, fs, root, canonicalRoot, accesses, deniedAccesses } = await fixture();
	await Effect.runPromise(fs.makeDirectory(`${root}/Notes`));
	await Effect.runPromise(fs.writeFileString(`${root}/Notes/note.md`, "# Directory note"));
	await Effect.runPromise(fs.symlink(`${root}/Notes`, `${root}/Alias`));
	await Effect.runPromise(fs.symlink(root, `${root}/Notes/back`));
	const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);
	expect(files).toHaveLength(2);
	expect(files.filter((file) => file.contents.includes("# Directory note"))).toHaveLength(1);
	expect(accesses.filter((access) => access.operation === "readDirectory")).toEqual([
		{ operation: "readDirectory", canonicalPath: canonicalRoot },
		{ operation: "readDirectory", canonicalPath: `${canonicalRoot}/Notes` },
	]);
	accesses.length = 0;
	expect(await Effect.runPromise(workspace.readText("missing.md", "page.md"))).toBe(false);
	expect(accesses.filter((access) => access.operation === "readDirectory")).toHaveLength(2);
	expect(await Effect.runPromise(workspace.readText("Alias/note.md", "page.md"))).toBe(
		"# Directory note",
	);
	expect(deniedAccesses).toEqual([]);
});

test.each(["Notes", "Alias", ".", "./"])(
	"directory aliases preserve the selected logical publishing route: %s",
	async (folderToPublish) => {
		const { fs, root, createWorkspace } = await fixture();
		await Effect.runPromise(fs.makeDirectory(`${root}/Notes`));
		await Effect.runPromise(fs.writeFileString(`${root}/Notes/note.md`, "# Note"));
		await Effect.runPromise(fs.symlink(`${root}/Notes`, `${root}/Alias`));
		const workspace = await Effect.runPromise(
			createWorkspace(root, undefined, folderToPublish),
		);
		const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);
		const notes = files.filter((file) => file.fileName === "note.md");
		expect(notes.map((file) => file.absoluteFilePath)).toEqual([
			`${folderToPublish === "Alias" ? "Alias" : "Notes"}/note.md`,
		]);
	},
);

test("missing embeds remain literal and do not search beyond the content root", async () => {
	const { workspace, fs, root, deniedAccesses } = await fixture();
	await Effect.runPromise(fs.writeFileString(`${root}/page.md`, "Before\n![[outside]]\nAfter"));
	const page = await Effect.runPromise(workspace.loadMarkdownFile(`${root}/page.md`));
	expect(page.contents).toBe("Before\n![[outside]]\nAfter");
	expect(deniedAccesses).toEqual([]);
});

test("an unresolved relative sibling embed remains literal after bounded ancestor lookup", async () => {
	const { workspace, fs, root, deniedAccesses } = await fixture();
	await Effect.runPromise(fs.makeDirectory(`${root}/Publish`));
	const contents = "Before\n![[../missing]]\nAfter";
	await Effect.runPromise(fs.writeFileString(`${root}/Publish/note.md`, contents));
	const page = await Effect.runPromise(workspace.loadMarkdownFile(`${root}/Publish/note.md`));
	expect(page.contents).toBe(contents);
	expect(await Effect.runPromise(workspace.readText("../missing.md", "Publish/note.md"))).toBe(
		false,
	);
	expect(deniedAccesses).toEqual([]);
});
