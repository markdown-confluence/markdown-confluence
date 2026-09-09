import * as EffectPath from "effect/Path";
import * as EffectFileSystem from "effect/FileSystem";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import { systemError, type PlatformError } from "effect/PlatformError";
import { App, FileSystemAdapter, normalizePath, TFile, TFolder } from "obsidian";
import { RuntimeEnvironmentService } from "@markdown-confluence/lib";

export function ObsidianPlatformLive(app: App) {
	return Layer.mergeAll(
		ObsidianFileSystemLive(app),
		ObsidianPathLive,
		Layer.succeed(RuntimeEnvironmentService as never, {
			cwd: Effect.succeed("/"),
			chdir: () => Effect.void,
			argv: Effect.succeed([]),
			getEnv: (_name: string) => Effect.succeed(undefined),
			setMaxListeners: () => Effect.void,
			exit: (code: number) => Effect.die(new Error(`Unexpected Obsidian exit ${code}`)),
		}),
	);
}

const ObsidianPathLive: Layer.Layer<EffectPath.Path> = Layer.effect(EffectPath.Path)(
	Effect.map(Effect.provide(EffectPath.Path, EffectPath.layer), (path): EffectPath.Path => ({
		...path,
		resolve: (...pathSegments) => path.resolve("/", ...pathSegments),
	})),
);

function ObsidianFileSystemLive(app: App): Layer.Layer<EffectFileSystem.FileSystem> {
	return Layer.effect(EffectFileSystem.FileSystem)(
		Effect.gen(function* () {
			const nativeFs = yield* EffectFileSystem.FileSystem.pipe(
				Effect.provide(NodeFileSystem.layer),
			);
			const nativePath = yield* EffectPath.Path.pipe(Effect.provide(NodePath.layer));
			const canonicalVaultPath = (file: TFile | TFolder, requestedPath: string) =>
				Effect.gen(function* () {
					const adapter = app.vault.adapter;
					if (!(adapter instanceof FileSystemAdapter)) {
						return yield* Effect.fail(
							systemError({
								_tag: "Unknown",
								module: "ObsidianFileSystem",
								method: "realPath",
								description:
									"Publishing requires a desktop FileSystemAdapter with physical path validation",
								pathOrDescriptor: requestedPath,
							}),
						);
					}
					const physicalRoot = yield* nativeFs.realPath(adapter.getBasePath());
					const physicalTarget = yield* nativeFs.realPath(
						adapter.getFullPath(file === app.vault.getRoot() ? "" : file.path),
					);
					const relative = nativePath.relative(physicalRoot, physicalTarget);
					if (
						relative === ".." ||
						relative.startsWith(`..${nativePath.sep}`) ||
						nativePath.isAbsolute(relative)
					) {
						return yield* Effect.fail(
							systemError({
								_tag: "PermissionDenied",
								module: "ObsidianFileSystem",
								method: "realPath",
								description:
									"Path resolves outside contentRoot at the physical vault boundary",
								pathOrDescriptor: requestedPath,
							}),
						);
					}
					return relative ? `/${relative.replaceAll("\\", "/")}` : "/";
				});
			const checkedFile = (method: string, path: string, requireCanonical = false) =>
				Effect.gen(function* () {
					const file = getAbstractFile(app, path);
					if (!(file instanceof TFile) && !(file instanceof TFolder))
						return yield* Effect.fail(toNotFound(method, path));
					const canonical = yield* canonicalVaultPath(file, path);
					if (requireCanonical && canonical !== `/${toVaultPath(path)}`) {
						return yield* Effect.fail(
							systemError({
								_tag: "PermissionDenied",
								module: "ObsidianFileSystem",
								method,
								description: "Path changed after contentRoot canonical validation",
								pathOrDescriptor: path,
							}),
						);
					}
					return file;
				});
			return EffectFileSystem.makeNoop({
				access: (path) =>
					Effect.gen(function* () {
						yield* checkedFile("access", path);
					}),
				exists: (path) =>
					Effect.gen(function* () {
						const file = getAbstractFile(app, path);
						if (!(file instanceof TFile) && !(file instanceof TFolder)) return false;
						yield* canonicalVaultPath(file, path);
						return true;
					}),
				realPath: (path) =>
					Effect.gen(function* () {
						const file = getAbstractFile(app, path);
						if (!(file instanceof TFile) && !(file instanceof TFolder)) {
							return yield* Effect.fail(toNotFound("realPath", path));
						}

						return yield* canonicalVaultPath(file, path);
					}),
				readDirectory: (path) =>
					Effect.gen(function* () {
						const folder = yield* checkedFile("readDirectory", path, true);
						if (!(folder instanceof TFolder)) {
							return yield* Effect.fail(toNotFound("readDirectory", path));
						}

						return folder.children.map((child) => child.name);
					}),
				readFile: (path) =>
					Effect.gen(function* () {
						const file = yield* checkedFile("readFile", path, true);
						if (!(file instanceof TFile)) {
							return yield* Effect.fail(toNotFound("readFile", path));
						}

						return yield* Effect.tryPromise({
							try: async () => new Uint8Array(await app.vault.readBinary(file)),
							catch: (cause) => toPlatformError("readFile", path, cause),
						});
					}),
				readFileString: (path) =>
					Effect.gen(function* () {
						const file = yield* checkedFile("readFileString", path, true);
						if (!(file instanceof TFile)) {
							return yield* Effect.fail(toNotFound("readFileString", path));
						}

						return yield* Effect.tryPromise({
							try: () => app.vault.cachedRead(file),
							catch: (cause) => toPlatformError("readFileString", path, cause),
						});
					}),
				stat: (path) =>
					Effect.gen(function* () {
						const file = yield* checkedFile("stat", path);

						const now = new Date();
						const stats = file instanceof TFile ? file.stat : undefined;
						const mtime = stats ? new Date(stats.mtime) : now;
						const ctime = stats ? new Date(stats.ctime) : now;

						return {
							type: file instanceof TFolder ? "Directory" : "File",
							mtime: Option.some(mtime),
							atime: Option.none(),
							birthtime: Option.some(ctime),
							dev: 0,
							ino: Option.none(),
							mode: file instanceof TFolder ? 0o755 : 0o644,
							nlink: Option.none(),
							uid: Option.none(),
							gid: Option.none(),
							rdev: Option.none(),
							size: EffectFileSystem.Size(stats?.size ?? 0),
							blksize: Option.none(),
							blocks: Option.none(),
						};
					}),
				writeFileString: (path, data) =>
					Effect.gen(function* () {
						const file = yield* checkedFile("writeFileString", path, true);
						if (!(file instanceof TFile))
							return yield* Effect.fail(toNotFound("writeFileString", path));
						yield* Effect.tryPromise({
							try: () => app.vault.modify(file, data),
							catch: (cause) => toPlatformError("writeFileString", path, cause),
						});
					}),
			});
		}),
	);
}

function getAbstractFile(app: App, path: string) {
	const vaultPath = toVaultPath(path);
	return vaultPath === "" ? app.vault.getRoot() : app.vault.getAbstractFileByPath(vaultPath);
}

function toVaultPath(path: string): string {
	const vaultPath = normalizePath(path.replace(/^\/+/, ""));
	return vaultPath === "." ? "" : vaultPath;
}

function toNotFound(method: string, path: string): PlatformError {
	return systemError({
		_tag: "NotFound",
		module: "ObsidianFileSystem",
		method,
		description: "No such file or directory",
		pathOrDescriptor: path,
	});
}

function toPlatformError(method: string, path: string, cause: unknown): PlatformError {
	return systemError({
		_tag: "Unknown",
		module: "ObsidianFileSystem",
		method,
		pathOrDescriptor: path,
		cause,
	});
}
