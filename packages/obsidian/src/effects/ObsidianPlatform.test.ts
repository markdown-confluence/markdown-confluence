import { afterEach, expect, test, vi } from "@effect/vitest";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import type { App } from "obsidian";
import {
	ConfluenceUploadSettings,
	makeMarkdownWorkspaceEffect,
	runEffect,
} from "@markdown-confluence/lib";

class VaultFile {
	name: string;
	stat: { ctime: number; mtime: number; size: number };
	constructor(
		public path: string,
		public content: string,
	) {
		this.name = path.split("/").at(-1)!;
		this.stat = { ctime: 1, mtime: 1, size: new TextEncoder().encode(content).length };
	}
}

class VaultFolder {
	name: string;
	children: Array<VaultFile | VaultFolder> = [];
	constructor(public path: string) {
		this.name = path.split("/").at(-1)!;
	}
}

class DesktopVaultAdapter {
	constructor(
		public basePath: string,
		private resolveFullPath: (path: string) => string,
	) {}
	getBasePath() {
		return this.basePath;
	}
	getFullPath(path: string) {
		return this.resolveFullPath(path);
	}
}

vi.doMock("obsidian", () => ({
	TFile: VaultFile,
	TFolder: VaultFolder,
	FileSystemAdapter: DesktopVaultAdapter,
	normalizePath: (path: string) =>
		path
			.replaceAll("\\", "/")
			.replace(/\/{2,}/g, "/")
			.replace(/\/$/, ""),
}));
const { ObsidianPlatformLive } = await import("./ObsidianPlatform");

const temporaryDirectories: string[] = [];
afterEach(async () => {
	await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			for (const directory of temporaryDirectories.splice(0))
				yield* fs.remove(directory, { recursive: true, force: true });
		}),
	);
});

async function createVault() {
	const { fs, path, directory, vaultPath, canonicalVaultRoot } = await runEffect(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const directory = yield* fs.makeTempDirectory({ prefix: "obsidian-physical-paths-" });
			temporaryDirectories.push(directory);
			const vaultPath = path.join(directory, "vault");
			yield* fs.makeDirectory(path.join(vaultPath, "Docs", "Shared"), { recursive: true });
			return {
				fs,
				path,
				directory,
				vaultPath,
				canonicalVaultRoot: yield* fs.realPath(vaultPath),
			};
		}),
	);
	const adapter = new DesktopVaultAdapter(vaultPath, (relative) =>
		path.join(adapter.basePath, relative),
	);
	const root = new VaultFolder("");
	const docs = new VaultFolder("Docs");
	const includedFolder = new VaultFolder("Docs/Shared");
	const page = new VaultFile("Docs/page.md", "# Page\n\n![[Shared/Included]]");
	const included = new VaultFile(
		"Docs/Shared/Included.md",
		"---\nconnie-publish: false\n---\nIncluded content",
	);
	const image = new VaultFile("Docs/photo.png", "image fixture");
	const outside = new VaultFile("outside.txt", "outside marker");
	root.children.push(docs, outside);
	docs.children.push(page, includedFolder, image);
	includedFolder.children.push(included);
	const entries = new Map<string, VaultFile | VaultFolder>(
		[root, docs, includedFolder, page, included, image, outside].map((entry) => [
			entry.path,
			entry,
		]),
	);
	for (const entry of entries.values()) {
		if (entry instanceof VaultFile)
			await Effect.runPromise(
				fs.writeFileString(adapter.getFullPath(entry.path), entry.content),
			);
	}
	const fixtureFile = async (file: VaultFile) => {
		const canonical = await Effect.runPromise(fs.realPath(adapter.getFullPath(file.path)));
		if (!canonical.startsWith(`${canonicalVaultRoot}${path.sep}`))
			throw new Error("Test prevented data access outside fixture vault");
		return canonical;
	};
	const cachedRead = vi.fn(async (file: VaultFile) =>
		Effect.runPromise(fs.readFileString(await fixtureFile(file))),
	);
	const readBinary = vi.fn(
		async (file: VaultFile) =>
			(await Effect.runPromise(fs.readFile(await fixtureFile(file)))).buffer,
	);
	const modify = vi.fn(async (file: VaultFile, content: string) => {
		await Effect.runPromise(fs.writeFileString(await fixtureFile(file), content));
		file.content = content;
		file.stat.size = new TextEncoder().encode(content).length;
	});
	const app = {
		vault: {
			adapter,
			getRoot: () => root,
			getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
			cachedRead,
			readBinary,
			modify,
			create: vi.fn(),
		},
	} as unknown as App;
	return {
		app,
		entries,
		page,
		outside,
		cachedRead,
		readBinary,
		modify,
		fs,
		path,
		directory,
		vaultPath,
		adapter,
		root,
		docs,
	};
}

test("resolves vault paths from a virtual root with normal absolute-path semantics", async () => {
	const { app } = await createVault();
	const paths = await Effect.runPromise(
		Effect.gen(function* () {
			const path = yield* Path;
			return [
				path.resolve(),
				path.resolve("Docs", "Shared/../page.md"),
				path.resolve("/Docs", "/Docs/page.md"),
				path.resolve("/Docs", "/outside.txt"),
			];
		}).pipe(Effect.provide(ObsidianPlatformLive(app))),
	);
	expect(paths).toEqual(["/", "/Docs/page.md", "/Docs/page.md", "/outside.txt"]);
});

test("canonical paths come from existing Vault objects and missing paths fail", async () => {
	const { app, entries, outside } = await createVault();
	entries.set("Docs/alias.txt", outside);
	const filesystem = await Effect.runPromise(
		FileSystem.pipe(Effect.provide(ObsidianPlatformLive(app))),
	);
	for (const [path, canonical] of [
		["/", "/"],
		["/Docs/", "/Docs"],
		["Docs/page.md", "/Docs/page.md"],
		["/Docs/alias.txt", "/outside.txt"],
	]) {
		expect(await Effect.runPromise(filesystem.realPath(path!))).toBe(canonical);
	}
	await expect(Effect.runPromise(filesystem.realPath("/missing.txt"))).rejects.toThrow();
	await expect(Effect.runPromise(filesystem.realPath("../outside.txt"))).rejects.toThrow();
});

test.each([
	{ contentRoot: "/", pagePath: "Docs/page.md" },
	{ contentRoot: "/Docs", pagePath: "page.md" },
])(
	"prepares pages, reads attachments and updates metadata under $contentRoot",
	async ({ contentRoot, pagePath }) => {
		const { app, page, modify } = await createVault();
		const workspace = await Effect.runPromise(
			makeMarkdownWorkspaceEffect({
				...ConfluenceUploadSettings.DEFAULT_SETTINGS,
				contentRoot,
				folderToPublish: ".",
			}).pipe(Effect.provide(ObsidianPlatformLive(app))),
		);
		const files = await Effect.runPromise(workspace.getMarkdownFilesToUpload);
		expect(files).toHaveLength(1);
		expect(files[0]?.absoluteFilePath).toBe(pagePath);
		expect(files[0]?.contents).toContain("Included content");
		expect(
			await Effect.runPromise(workspace.readText("Shared/Included.md", pagePath)),
		).toContain("Included content");
		const binary = await Effect.runPromise(workspace.readBinary("photo.png", pagePath));
		expect(binary).toMatchObject({ filename: "photo.png" });
		await Effect.runPromise(workspace.updateMarkdownValues("/Docs/page.md", { pageId: "123" }));
		expect(modify).toHaveBeenCalledOnce();
		expect(page.content).toContain("connie-page-id:");
		expect(page.content).toContain("![[Shared/Included]]");
		const loaded = await Effect.runPromise(workspace.loadMarkdownFile("/Docs/page.md"));
		expect(String(loaded.frontmatter["connie-page-id"])).toBe("123");
	},
);

test("a non-root workspace rejects paths and canonical aliases to other vault content", async () => {
	const { app, entries, outside, cachedRead, readBinary, modify } = await createVault();
	entries.set("Docs/alias.txt", outside);
	const workspace = await Effect.runPromise(
		makeMarkdownWorkspaceEffect({
			...ConfluenceUploadSettings.DEFAULT_SETTINGS,
			contentRoot: "/Docs",
			folderToPublish: ".",
		}).pipe(Effect.provide(ObsidianPlatformLive(app))),
	);
	for (const target of ["../outside.txt", "alias.txt"]) {
		await expect(Effect.runPromise(workspace.readBinary(target, "page.md"))).rejects.toThrow();
		await expect(Effect.runPromise(workspace.readText(target, "page.md"))).rejects.toThrow();
	}
	await expect(Effect.runPromise(workspace.loadMarkdownFile("/outside.txt"))).rejects.toThrow();
	await expect(
		Effect.runPromise(workspace.updateMarkdownValues("/outside.txt", { pageId: "123" })),
	).rejects.toThrow();
	expect(cachedRead).not.toHaveBeenCalled();
	expect(readBinary).not.toHaveBeenCalled();
	expect(modify).not.toHaveBeenCalled();
	expect(outside.content).toBe("outside marker");
});

test.each(["/", "/Docs"])(
	"physical external directory links cannot be published from contentRoot %s",
	async (contentRoot) => {
		const fixture = await createVault();
		const { app, fs, directory, vaultPath, entries, docs, cachedRead, readBinary, modify } =
			fixture;
		const outsideFolder = `${directory}/outside`;
		await Effect.runPromise(fs.makeDirectory(outsideFolder));
		await Effect.runPromise(
			fs.writeFileString(`${outsideFolder}/secret.md`, "EXTERNAL_MARKER"),
		);
		await Effect.runPromise(fs.symlink(outsideFolder, `${vaultPath}/Docs/Linked`));
		const linkedFolder = new VaultFolder("Docs/Linked");
		const linkedFile = new VaultFile("Docs/Linked/secret.md", "EXTERNAL_MARKER");
		linkedFolder.children.push(linkedFile);
		docs.children.push(linkedFolder);
		entries.set(linkedFolder.path, linkedFolder);
		entries.set(linkedFile.path, linkedFile);
		const workspace = await Effect.runPromise(
			makeMarkdownWorkspaceEffect({
				...ConfluenceUploadSettings.DEFAULT_SETTINGS,
				contentRoot,
				folderToPublish: ".",
			}).pipe(Effect.provide(ObsidianPlatformLive(app))),
		);
		const pagePath = contentRoot === "/" ? "Docs/page.md" : "page.md";
		await expect(
			Effect.runPromise(workspace.readBinary("Linked/secret.md", pagePath)),
		).rejects.toThrow("contentRoot");
		await expect(
			Effect.runPromise(workspace.readText("Linked/secret.md", pagePath)),
		).rejects.toThrow("contentRoot");
		await expect(
			Effect.runPromise(workspace.loadMarkdownFile("/Docs/Linked/secret.md")),
		).rejects.toThrow("contentRoot");
		await expect(
			Effect.runPromise(
				workspace.updateMarkdownValues("/Docs/Linked/secret.md", { pageId: "123" }),
			),
		).rejects.toThrow("contentRoot");
		await expect(Effect.runPromise(workspace.getMarkdownFilesToUpload)).rejects.toThrow(
			"contentRoot",
		);
		expect(linkedFile.path).toBe("Docs/Linked/secret.md");
		expect(cachedRead).not.toHaveBeenCalled();
		expect(readBinary).not.toHaveBeenCalled();
		expect(modify).not.toHaveBeenCalled();
		expect(await Effect.runPromise(fs.readFileString(`${outsideFolder}/secret.md`))).toBe(
			"EXTERNAL_MARKER",
		);
	},
);

test("physical links outside a selected folder retain their canonical vault identity", async () => {
	const { app, fs, vaultPath, entries, cachedRead, readBinary } = await createVault();
	await Effect.runPromise(fs.symlink(`${vaultPath}/outside.txt`, `${vaultPath}/Docs/linked.txt`));
	const linked = new VaultFile("Docs/linked.txt", "outside marker");
	entries.set(linked.path, linked);
	const filesystem = await Effect.runPromise(
		FileSystem.pipe(Effect.provide(ObsidianPlatformLive(app))),
	);
	expect(await Effect.runPromise(filesystem.realPath("/Docs/linked.txt"))).toBe("/outside.txt");
	const workspace = await Effect.runPromise(
		makeMarkdownWorkspaceEffect({
			...ConfluenceUploadSettings.DEFAULT_SETTINGS,
			contentRoot: "/Docs",
			folderToPublish: ".",
		}).pipe(Effect.provide(ObsidianPlatformLive(app))),
	);
	await expect(Effect.runPromise(workspace.readBinary("linked.txt", "page.md"))).rejects.toThrow(
		"contentRoot",
	);
	expect(cachedRead).not.toHaveBeenCalled();
	expect(readBinary).not.toHaveBeenCalled();
});

test("internal file links and a physically symlinked vault root remain usable", async () => {
	const { app, fs, vaultPath, directory, adapter, entries, page, modify } = await createVault();
	await Effect.runPromise(fs.symlink(vaultPath, `${directory}/vault-link`));
	adapter.basePath = `${directory}/vault-link`;
	await Effect.runPromise(fs.symlink(`${vaultPath}/Docs/page.md`, `${vaultPath}/Docs/linked.md`));
	entries.set("Docs/linked.md", new VaultFile("Docs/linked.md", page.content));
	const workspace = await Effect.runPromise(
		makeMarkdownWorkspaceEffect({
			...ConfluenceUploadSettings.DEFAULT_SETTINGS,
			contentRoot: "/Docs",
			folderToPublish: ".",
		}).pipe(Effect.provide(ObsidianPlatformLive(app))),
	);
	const loaded = await Effect.runPromise(workspace.loadMarkdownFile("/Docs/linked.md"));
	expect(loaded.absoluteFilePath).toBe("linked.md");
	expect(loaded.contents).toContain("Included content");
	await Effect.runPromise(workspace.updateMarkdownValues("/Docs/linked.md", { pageId: "123" }));
	expect(modify).toHaveBeenCalledWith(page, expect.stringContaining("connie-page-id:"));
});

test("data operations revalidate physical paths after canonical lookup", async () => {
	const { app, fs, directory, vaultPath, readBinary, modify } = await createVault();
	const filesystem = await Effect.runPromise(
		FileSystem.pipe(Effect.provide(ObsidianPlatformLive(app))),
	);
	const canonical = await Effect.runPromise(filesystem.realPath("/Docs/photo.png"));
	await Effect.runPromise(fs.writeFileString(`${directory}/outside.png`, "SWAPPED_MARKER"));
	await Effect.runPromise(fs.remove(`${vaultPath}/Docs/photo.png`));
	await Effect.runPromise(fs.symlink(`${directory}/outside.png`, `${vaultPath}/Docs/photo.png`));
	await expect(Effect.runPromise(filesystem.readFile(canonical))).rejects.toThrow("contentRoot");
	await expect(
		Effect.runPromise(filesystem.writeFileString(canonical, "must not write")),
	).rejects.toThrow("contentRoot");
	expect(readBinary).not.toHaveBeenCalled();
	expect(modify).not.toHaveBeenCalled();
	expect(await Effect.runPromise(fs.readFileString(`${directory}/outside.png`))).toBe(
		"SWAPPED_MARKER",
	);
	await Effect.runPromise(fs.remove(`${vaultPath}/Docs/photo.png`));
	await Effect.runPromise(fs.symlink(`${vaultPath}/outside.txt`, `${vaultPath}/Docs/photo.png`));
	await expect(Effect.runPromise(filesystem.readFile(canonical))).rejects.toThrow("contentRoot");
	await expect(
		Effect.runPromise(filesystem.writeFileString(canonical, "must not write")),
	).rejects.toThrow("contentRoot");
	expect(readBinary).not.toHaveBeenCalled();
	expect(modify).not.toHaveBeenCalled();
});

test("an unsupported adapter fails closed instead of trusting logical Vault paths", async () => {
	const { app, cachedRead, readBinary } = await createVault();
	app.vault.adapter = {} as App["vault"]["adapter"];
	await expect(
		Effect.runPromise(
			makeMarkdownWorkspaceEffect({
				...ConfluenceUploadSettings.DEFAULT_SETTINGS,
				contentRoot: "/",
				folderToPublish: ".",
			}).pipe(Effect.provide(ObsidianPlatformLive(app))),
		),
	).rejects.toThrow();
	expect(cachedRead).not.toHaveBeenCalled();
	expect(readBinary).not.toHaveBeenCalled();
});
