import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { NodeFileSystem, NodePath } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { build, defineConfig, type Plugin } from "vite-plus";
import { packageDependencyExternals } from "../../vite.package-build.ts";

const NodePlatformLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

function runNodePlatform<A>(effect: Effect.Effect<A, unknown, FileSystem | Path>) {
	return Effect.runPromise(effect.pipe(Effect.provide(NodePlatformLive)));
}

function mermaidRendererHtmlPlugin(): Plugin {
	return {
		apply: "build",
		name: "mermaid-renderer-html",
		async closeBundle() {
			await runNodePlatform(
				Effect.gen(function* () {
					const fs = yield* FileSystem;
					const path = yield* Path;
					const root = path.resolve(".");

					const result = yield* Effect.tryPromise({
						try: () =>
							build({
								build: {
									emptyOutDir: false,
									minify: true,
									rollupOptions: {
										input: "src/mermaid_renderer.js",
										output: {
											codeSplitting: false,
										},
									},
									sourcemap: false,
									target: "chrome106",
									write: false,
								},
								configFile: false,
								logLevel: "warn",
								root,
							}),
						catch: toError,
					});

					const output = Array.isArray(result) ? result[0]?.output : result.output;
					const chunk = output.find((file) => file.type === "chunk");
					if (!chunk || !("code" in chunk)) {
						return yield* Effect.fail(
							new Error("Vite did not produce the Mermaid renderer chunk"),
						);
					}

					const fileContents = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Mermaid Chart</title>
  </head>
  <body>
    <div id="graphDiv"></div>
    <script type="text/javascript">
${chunk.code}
    </script>
  </body>
</html>
`;

					yield* fs.makeDirectory("dist", { recursive: true });
					yield* fs.writeFileString(
						path.resolve("dist", "mermaid_renderer.html"),
						fileContents,
					);
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
		rollupOptions: {
			external: packageDependencyExternals(import.meta.url),
		},
		sourcemap: true,
		target: "node16",
	},
	plugins: [mermaidRendererHtmlPlugin()],
	resolve: {
		mainFields: ["module", "main"],
	},
});

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : JSON.stringify(error));
}
