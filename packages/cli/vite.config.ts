import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { defineConfig, type Plugin } from "vite-plus";
import { generatedBanner, isNodeBuiltin } from "../../vite.shared.ts";

const NodePlatformLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

function runNodePlatform<A>(effect: Effect.Effect<A, unknown, FileSystem | Path>) {
	return Effect.runPromise(effect.pipe(Effect.provide(NodePlatformLive)));
}

function copyRendererHtmlPlugin(): Plugin {
	return {
		apply: "build",
		name: "copy-mermaid-renderer-html",
		async closeBundle() {
			await runNodePlatform(
				Effect.gen(function* () {
					const fs = yield* FileSystem;
					const path = yield* Path;
					const source = path.resolve(
						"../mermaid-puppeteer-renderer/dist/mermaid_renderer.html",
					);
					const target = path.resolve("dist/mermaid_renderer.html");

					yield* fs.makeDirectory(path.dirname(target), { recursive: true });
					yield* fs.copyFile(source, target);
				}),
			);
		},
	};
}

export default defineConfig({
	build: {
		emptyOutDir: true,
		lib: {
			entry: "src/index.ts",
			fileName: () => "index.js",
			formats: ["es"],
		},
		minify: true,
		rollupOptions: {
			external: isNodeBuiltin,
			output: {
				banner: generatedBanner,
				codeSplitting: false,
			},
		},
		sourcemap: true,
		target: "node16",
	},
	plugins: [copyRendererHtmlPlugin()],
	resolve: {
		mainFields: ["module", "main"],
	},
});
