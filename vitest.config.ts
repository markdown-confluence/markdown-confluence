import { defineConfig } from "vite-plus/test/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			"@markdown-confluence/lib": fileURLToPath(
				new URL("./packages/lib/src/index.ts", import.meta.url),
			),
		},
	},
	test: {
		globals: true,
		environment: "node",
		include: [
			"packages/cli/src/**/*.test.ts",
			"packages/obsidian/src/**/*.test.ts",
			"packages/lib/src/**/*.test.ts",
			"packages/mermaid-electron-renderer/src/**/*.test.ts",
			"packages/mermaid-puppeteer-renderer/src/**/*.test.ts",
			"packages/plantuml-renderer/src/**/*.test.ts",
			"scripts/**/*.test.js",
			"services/**/*.test.js",
		],
		testTimeout: 300000,
	},
});
