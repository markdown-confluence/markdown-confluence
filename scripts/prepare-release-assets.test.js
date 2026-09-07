import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { expect, test } from "@effect/vitest";
import { prepareReleaseAssets, releasePackages } from "./prepare-release-assets.js";

const platform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

function withReleaseFixture(verify) {
	return Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const fs = yield* FileSystem;
				const path = yield* Path;
				const root = yield* fs.makeTempDirectoryScoped({ prefix: "release-assets-" });
				const write = (filename, contents) =>
					fs.writeFileString(path.join(root, filename), contents);
				yield* write("package.json", '{"version":"6.0.0"}');
				yield* write("manifest.json", '{"version":"6.0.0","id":"confluence-integration"}');
				yield* write("README.md", "Release documentation");
				yield* write("LICENSE", "Release license");
				for (const packageName of releasePackages) {
					yield* fs.makeDirectory(path.join(root, "packages", packageName, "dist"), {
						recursive: true,
					});
					yield* write(
						`packages/${packageName}/package.json`,
						JSON.stringify({
							version: "6.0.0",
							...(packageName === "obsidian" ? {} : { types: "dist/index.d.ts" }),
						}),
					);
					yield* write(
						`packages/${packageName}/dist/${packageName === "obsidian" ? "main.js" : "index.js"}`,
						"module.exports = {};",
					);
					yield* write(`packages/${packageName}/dist/index.d.ts`, "export {};");
					yield* write(
						`packages/${packageName}/dist/mermaid_renderer.html`,
						"<html>Mermaid renderer</html>",
					);
				}
				yield* verify(root, fs, path, write);
			}),
		).pipe(Effect.provide(platform)),
	);
}

test("prepares the Obsidian manifest after a complete build", async () => {
	await withReleaseFixture((root, fs, path) =>
		Effect.gen(function* () {
			const release = yield* prepareReleaseAssets(root);
			expect(release.version).toBe("6.0.0");
			expect(
				yield* fs.readFileString(path.join(release.outputDirectory, "manifest.json")),
			).toContain('"version":"6.0.0"');
			expect(yield* fs.readFileString(path.join(release.outputDirectory, "README.md"))).toBe(
				"Release documentation",
			);
		}),
	);
});

test("rejects a partial build before preparing publishable metadata", async () => {
	await withReleaseFixture((root, fs, path) =>
		Effect.gen(function* () {
			yield* fs.remove(path.join(root, "packages/cli/dist/mermaid_renderer.html"));
			const result = yield* Effect.result(prepareReleaseAssets(root));
			expect(result._tag).toBe("Failure");
			expect(yield* fs.exists(path.join(root, "packages/obsidian/dist/manifest.json"))).toBe(
				false,
			);
		}),
	);
});

test("rejects mismatched package versions and invalid Obsidian bundles", async () => {
	await withReleaseFixture((root, _fs, _path, write) =>
		Effect.gen(function* () {
			yield* write("packages/plantuml-renderer/package.json", '{"version":"5.5.2"}');
			expect((yield* Effect.result(prepareReleaseAssets(root)))._tag).toBe("Failure");
			yield* write("packages/plantuml-renderer/package.json", '{"version":"6.0.0"}');
			yield* write("packages/obsidian/dist/main.js", "export default class Plugin {}");
			expect((yield* Effect.result(prepareReleaseAssets(root)))._tag).toBe("Failure");
		}),
	);
});

test("rejects stale workspace dependencies before preparing release assets", async () => {
	await withReleaseFixture((root, fs, path, write) =>
		Effect.gen(function* () {
			for (const dependencyType of ["dependencies", "devDependencies"]) {
				for (const version of ["workspace:5.5.2", "5.5.2"]) {
					yield* write(
						"packages/plantuml-renderer/package.json",
						JSON.stringify({
							version: "6.0.0",
							[dependencyType]: { "@markdown-confluence/lib": version },
						}),
					);
					expect((yield* Effect.result(prepareReleaseAssets(root)))._tag).toBe("Failure");
					expect(
						yield* fs.exists(path.join(root, "packages/obsidian/dist/manifest.json")),
					).toBe(false);
				}
			}
			for (const version of ["workspace:*", "workspace:6.0.0"]) {
				yield* write(
					"packages/plantuml-renderer/package.json",
					JSON.stringify({
						version: "6.0.0",
						dependencies: { "@markdown-confluence/lib": version },
					}),
				);
				expect((yield* prepareReleaseAssets(root)).version).toBe("6.0.0");
			}
		}),
	);
});
