import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite-plus";
import { generatedBanner, isNodeBuiltin } from "../../vite.shared.ts";

function copyRendererHtmlPlugin(): Plugin {
	return {
		apply: "build",
		name: "copy-mermaid-renderer-html",
		async closeBundle() {
			const source = resolve("../mermaid-puppeteer-renderer/dist/mermaid_renderer.html");
			const target = resolve("dist/mermaid_renderer.html");

			await mkdir(dirname(target), { recursive: true });
			await copyFile(source, target);
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
