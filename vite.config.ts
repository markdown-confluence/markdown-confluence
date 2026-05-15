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
		categories: {
			correctness: "error",
		},
		rules: {
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
