import { defineConfig } from "vite-plus";
import { packageDependencyExternals } from "../../vite.package-build.ts";

const external = packageDependencyExternals(import.meta.url);

function shouldBundleConversionDependency(id: string): boolean {
	// Bundle conversion dependencies so the patched parser resolutions reach npm consumers.
	return id === "image-size" || id.startsWith("@atlaskit/");
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
			external: (id) => (shouldBundleConversionDependency(id) ? false : external(id)),
		},
		sourcemap: true,
		target: "es2022",
	},
	resolve: {
		mainFields: ["module", "main"],
	},
});
