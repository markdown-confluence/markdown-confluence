import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, defineConfig, type Plugin } from "vite-plus";
import { packageDependencyExternals } from "../../vite.package-build.ts";

/**
 * Creates a Vite build plugin that produces a standalone HTML file embedding the compiled Mermaid renderer.
 *
 * The plugin runs during the build's closeBundle step, performs an internal build of `src/mermaid_renderer.js`,
 * extracts the generated renderer chunk, and writes `dist/mermaid_renderer.html` containing the chunk's code
 * inside an inline script tag.
 *
 * @returns A Vite plugin configured to run during the build and generate `dist/mermaid_renderer.html`.
 * @throws Error if the internal Vite build does not produce the expected renderer chunk with inlined code.
 */
function mermaidRendererHtmlPlugin(): Plugin {
	return {
		apply: "build",
		name: "mermaid-renderer-html",
		async closeBundle() {
			const result = await build({
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
				root: process.cwd(),
			});

			const output = Array.isArray(result) ? result[0]?.output : result.output;
			const chunk = output.find((file) => file.type === "chunk");
			if (!chunk || !("code" in chunk)) {
				throw new Error("Vite did not produce the Mermaid renderer chunk");
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

			await mkdir("dist", { recursive: true });
			await writeFile(resolve("dist", "mermaid_renderer.html"), fileContents);
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
