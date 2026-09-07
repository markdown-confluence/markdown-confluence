import { defineConfig } from "vite-plus";
import { packageDependencyExternals } from "../../vite.package-build.ts";

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
		target: "node18",
	},
	resolve: {
		mainFields: ["module", "main"],
	},
});
