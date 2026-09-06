import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
	test: {
		environment: "node",
		include: [
			"packages/cli/src/**/*.test.ts",
			"packages/obsidian/src/**/*.test.ts",
			"packages/lib/src/**/*.test.ts",
			"packages/mermaid-electron-renderer/src/**/*.test.ts",
			"packages/plantuml-renderer/src/**/*.test.ts",
			"scripts/**/*.test.js",
		],
		testTimeout: 300000,
	},
});
