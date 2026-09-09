import { fileURLToPath } from "node:url";
import { build, type Plugin } from "vite-plus";

const moduleId = "virtual:markdown-confluence-mermaid-runtime";

// Keep Mermaid out of the privileged Obsidian host. The packaged renderer
// contains its browser bundle as text and executes it only in the sandbox.
export function mermaidRuntimeBundlePlugin(): Plugin {
	return {
		name: "isolated-mermaid-runtime",
		resolveId(id) {
			return id === moduleId ? `\0${moduleId}` : undefined;
		},
		async load(id) {
			if (id !== `\0${moduleId}`) return undefined;
			const result = await build({
				configFile: false,
				logLevel: "warn",
				build: {
					write: false,
					minify: true,
					sourcemap: false,
					target: "chrome106",
					lib: {
						entry: fileURLToPath(
							new URL(
								"../mermaid-puppeteer-renderer/src/mermaid_renderer.js",
								import.meta.url,
							),
						),
						formats: ["iife"],
						name: "MermaidRenderRuntime",
					},
					rollupOptions: { output: { codeSplitting: false } },
				},
			});
			const output = Array.isArray(result) ? result[0]?.output : result.output;
			const chunk = output?.find((file) => file.type === "chunk");
			if (!chunk || !("code" in chunk))
				throw new Error("Mermaid browser bundle was not generated");
			return `export default ${JSON.stringify(chunk.code)};`;
		},
	};
}
