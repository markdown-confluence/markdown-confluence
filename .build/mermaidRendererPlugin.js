import esbuild from "esbuild";
import process from "process";

export const mermaidRendererPlugin = {
	name: 'mermaidRendererPlugin',
	setup(build) {
		build.onResolve({ filter: /mermaid_renderer\.esbuild$/ }, args => {
			return {
				watchFiles: ['src/mermaid_renderer.js'],
				path: args.path,
				namespace: 'mermaid-binary',
			  }
		});
		build.onLoad({ filter: /mermaid_renderer\.esbuild$/, namespace: 'mermaid-binary' }, async (args) => {
			const result = await esbuild.build({
				entryPoints: ['src/mermaid_renderer.js'],
				bundle: true,
				format: 'cjs',
				target: 'chrome106',
				logLevel: 'info',
				sourcemap: false,
				treeShaking: true,
				write: false,
				mainFields: ['module', 'main'],
				minify: true,
			}).catch(() => process.exit(1));

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
	${result.outputFiles[0].text}
	</script>
  </body>
</html>
			`;

			return {
				contents: fileContents,
				loader: 'binary',
			}
		})
	}
};