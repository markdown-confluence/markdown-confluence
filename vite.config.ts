import { defineConfig } from "vite-plus";

export default defineConfig({
	fmt: {
		ignorePatterns: [
			"node_modules/**",
			"**/dist/**",
			"dev-vault/**",
			".fleet/**",
			".github/**",
			"**/*.md",
			"osv-scanner.toml",
			"release-please-config.json",
			".release-please-manifest.json",
		],
	},
	lint: {
		plugins: ["typescript", "unicorn", "oxc"],
		jsPlugins: [{ name: "effect", specifier: "./config/oxlint-effect-rules.js" }],
		categories: {
			correctness: "error",
		},
		rules: {
			"effect/no-direct-node-platform": [
				"error",
				{
					allowedProcessFileEndings: ["/packages/lib/src/effects/index.ts"],
				},
			],
			"effect/no-vitest-imports": "error",
			"effect/require-effect-all-concurrency": "error",
			"jest/no-standalone-expect": "off",
			"vitest/no-standalone-expect": "off",
		},
		ignorePatterns: ["node_modules/**", "**/dist/**", "dev-vault/**", ".husky/**"],
		env: {
			builtin: true,
		},
	},
	staged: {
		"package.json": "vp check --fix --no-error-on-unmatched-pattern",
		"tsconfig.json": "vp check --fix --no-error-on-unmatched-pattern",
		"vite.config.ts": "vp check --fix --no-error-on-unmatched-pattern",
		"vite.shared.ts": "vp check --fix --no-error-on-unmatched-pattern",
		"vitest.config.ts": "vp check --fix --no-error-on-unmatched-pattern",
		"packages/**/*.{json,js,ts,tsx}": "vp check --fix --no-error-on-unmatched-pattern",
	},
});
