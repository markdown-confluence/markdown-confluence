export default {
	packageManager: "pnpm",
	plugins: ["@stryker-mutator/typescript-checker"],
	testRunner: "command",
	commandRunner: {
		command: "vp test run",
	},
	coverageAnalysis: "off",
	checkers: ["typescript"],
	tsconfigFile: "packages/lib/tsconfig.json",
	concurrency: "50%",
	timeoutMS: 10000,
	mutate: [
		"packages/lib/src/**/*.ts",
		"!packages/lib/src/**/*.test.ts",
		"!packages/lib/src/index.ts",
	],
	reporters: ["progress", "clear-text", "html", "json"],
	htmlReporter: {
		fileName: "reports/mutation/mutation.html",
	},
	jsonReporter: {
		fileName: "reports/mutation/mutation.json",
	},
	incremental: true,
	incrementalFile: "reports/mutation/incremental.json",
	thresholds: {
		high: 80,
		low: 60,
		break: 0,
	},
};
