import { Path } from "effect/Path";
import { NodePath } from "@effect/platform-node";
import { Effect } from "effect";
import { defineConfig } from "vite-plus";
import { externalize, generatedBanner } from "../../vite.package-build.ts";

const resolvePath = (...pathSegments: ReadonlyArray<string>) =>
	Effect.runSync(
		Effect.gen(function* () {
			const path = yield* Path;
			return path.resolve(...pathSegments);
		}).pipe(Effect.provide(NodePath.layer)),
	);

const obsidianExternals = externalize([
	"obsidian",
	"electron",
	"@codemirror/autocomplete",
	"@codemirror/collab",
	"@codemirror/commands",
	"@codemirror/language",
	"@codemirror/lint",
	"@codemirror/search",
	"@codemirror/state",
	"@codemirror/view",
	"@lezer/common",
	"@lezer/highlight",
	"@lezer/lr",
]);

export default defineConfig(({ mode }) => {
	const isDevelopment = mode === "development";

	return {
		build: {
			emptyOutDir: true,
			lib: {
				entry: "src/main.ts",
				fileName: () => "main.js",
				formats: ["cjs"],
			},
			minify: true,
			outDir: isDevelopment
				? "../../dev-vault/.obsidian/plugins/obsidian-confluence"
				: "dist",
			rollupOptions: {
				external: obsidianExternals,
				output: {
					banner: generatedBanner,
					codeSplitting: false,
					exports: "default",
				},
			},
			sourcemap: isDevelopment ? "inline" : false,
			target: "chrome106",
		},
		resolve: {
			alias: {
				"@markdown-confluence/lib": resolvePath("../lib/src/index.ts"),
				"@markdown-confluence/mermaid-electron-renderer": resolvePath(
					"../mermaid-electron-renderer/src/index.ts",
				),
			},
			mainFields: ["module", "main"],
		},
	};
});
