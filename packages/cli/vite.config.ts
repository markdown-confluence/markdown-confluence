import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite-plus";
import { generatedBanner, isNodeBuiltin } from "../../vite.package-build.ts";

/**
 * Creates a Vite plugin that copies the prebuilt mermaid renderer HTML into the build output.
 *
 * @returns A Vite plugin object that applies during the build and, on closeBundle, copies the prebuilt `mermaid_renderer.html` into the `dist` output (creating the target directory if needed).
 */
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
