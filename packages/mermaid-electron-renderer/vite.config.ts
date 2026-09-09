import { defineConfig } from "vite-plus";
import { packageDependencyExternals } from "../../vite.package-build.ts";

import { mermaidRuntimeBundlePlugin } from "./rendererBundlePlugin";

export default defineConfig({
	plugins: [mermaidRuntimeBundlePlugin()],
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
		target: "chrome106",
	},
	resolve: {
		mainFields: ["module", "main"],
	},
});
