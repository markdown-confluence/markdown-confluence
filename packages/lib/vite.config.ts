import { defineConfig } from "vite-plus";
import { packageDependencyExternals } from "../../vite.package-build.ts";

const external = packageDependencyExternals(import.meta.url);

function shouldBundleDependencySubpath(id: string): boolean {
	return id === "image-size" || (id.startsWith("@atlaskit/") && id.split("/").length > 2);
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
			external: (id) => (shouldBundleDependencySubpath(id) ? false : external(id)),
		},
		sourcemap: true,
		target: "es2022",
	},
	resolve: {
		mainFields: ["module", "main"],
	},
});
