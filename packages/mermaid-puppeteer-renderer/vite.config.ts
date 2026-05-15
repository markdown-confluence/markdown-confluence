import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, defineConfig, type Plugin } from "vite-plus";
import { packageDependencyExternals } from "../../vite.shared.ts";

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
