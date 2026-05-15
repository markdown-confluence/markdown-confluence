import { resolve } from "node:path";
import { defineConfig } from "vite-plus";
import { externalize, generatedBanner } from "../../vite.shared.ts";

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
				"@markdown-confluence/lib": resolve("../lib/src/index.ts"),
				"@markdown-confluence/mermaid-electron-renderer": resolve(
					"../mermaid-electron-renderer/src/index.ts",
				),
			},
			mainFields: ["module", "main"],
		},
	};
});
