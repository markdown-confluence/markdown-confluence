import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

export const releasePackages = [
	"lib",
	"mermaid-electron-renderer",
	"mermaid-puppeteer-renderer",
	"plantuml-renderer",
	"cli",
	"obsidian",
];

/** Validate the complete build before preparing any files for publication. */
export function prepareReleaseAssets(repositoryRoot) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		const readJson = (relativePath) =>
			fs
				.readFileString(path.join(repositoryRoot, relativePath))
				.pipe(
					Effect.flatMap((contents) =>
						Effect.try({ try: () => JSON.parse(contents), catch: (error) => error }),
					),
				);
		const rootPackage = yield* readJson("package.json");
		const manifest = yield* readJson("manifest.json");
		if (
			!/^\d+\.\d+\.\d+$/.test(rootPackage.version) ||
			manifest.version !== rootPackage.version
		) {
			return yield* Effect.fail(
				new Error(
					"Release requires matching stable package and Obsidian manifest versions",
				),
			);
		}
		for (const packageName of releasePackages) {
			const packageRoot = `packages/${packageName}`;
			const metadata = yield* readJson(`${packageRoot}/package.json`);
			if (metadata.version !== rootPackage.version) {
				return yield* Effect.fail(new Error(`Release version mismatch: ${packageName}`));
			}
			for (const dependencies of [metadata.dependencies, metadata.devDependencies]) {
				for (const [dependency, version] of Object.entries(dependencies ?? {})) {
					if (
						dependency.startsWith("@markdown-confluence/") &&
						version !== "workspace:*" &&
						version !== `workspace:${rootPackage.version}`
					) {
						return yield* Effect.fail(
							new Error(
								`Release dependency mismatch: ${packageName} -> ${dependency}@${version}`,
							),
						);
					}
				}
			}
			const entryPoint = packageName === "obsidian" ? "main.js" : "index.js";
			const requiredFiles = [`${packageRoot}/dist/${entryPoint}`];
			if (metadata.types) requiredFiles.push(`${packageRoot}/${metadata.types}`);
			if (["cli", "mermaid-puppeteer-renderer"].includes(packageName)) {
				requiredFiles.push(`${packageRoot}/dist/mermaid_renderer.html`);
			}
			for (const requiredFile of requiredFiles) {
				const content = yield* fs.readFileString(path.join(repositoryRoot, requiredFile));
				if (!content.trim())
					return yield* Effect.fail(new Error(`Empty release artifact: ${requiredFile}`));
				if (packageName === "obsidian") {
					yield* Effect.try({
						try: () => new Script(content, { filename: requiredFile }),
						catch: (error) => error,
					});
				}
			}
		}
		const outputDirectory = path.join(repositoryRoot, "packages/obsidian/dist");
		// Vite empties dist during build, so these files must be copied afterwards.
		for (const filename of ["manifest.json", "README.md", "LICENSE"]) {
			yield* fs.copyFile(
				path.join(repositoryRoot, filename),
				path.join(outputDirectory, filename),
			);
		}
		yield* Console.log(`Prepared release ${rootPackage.version}: ${outputDirectory}`);
		return { version: rootPackage.version, outputDirectory };
	});
}

if (import.meta.main) {
	await Effect.runPromise(
		prepareReleaseAssets(fileURLToPath(new URL("../", import.meta.url))).pipe(
			Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
		),
	);
}
