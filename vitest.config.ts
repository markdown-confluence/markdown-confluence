import { defineConfig } from "vite-plus/test/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["packages/lib/src/**/*.test.ts", "scripts/**/*.test.js"],
		testTimeout: 300000,
	},
});
