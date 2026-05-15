import { defineConfig } from "vite-plus";
import { packageDependencyExternals } from "../../vite.shared.ts";

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
		target: "es2022",
	},
	resolve: {
		mainFields: ["module", "main"],
	},
});
