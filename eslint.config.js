import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
	{
		linterOptions: {
			reportUnusedDisableDirectives: "off",
		},
		ignores: [
			"npm",
			"node_modules",
			"build",
			"**/dist/**",
			"**/dev-vault/**",
			"**/dist-cli/**",
			".husky/**",
		],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	js.configs.recommended,
	...tsPlugin.configs["flat/recommended"],
	{
		rules: {
			...prettier.rules,
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ args: "none", caughtErrors: "none" },
			],
			"no-useless-assignment": "off",
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
			"@typescript-eslint/naming-convention": [
				"error",
				{
					selector: "property",
					format: ["strictCamelCase"],
					filter: {
						regex: "^(code_block|list_item|bullet_list|ordered_list|code_inline|media_single|User-Agent|Accept|Authorization|Content-Type)$",
						match: false,
					},
				},
			],
		},
	},
];
