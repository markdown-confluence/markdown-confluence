import { RuleTester } from "oxlint/plugins-dev";
import { expect, test } from "@effect/vitest";
import descriptivePlugin from "./oxlint-descriptive-rules.js";

RuleTester.describe = (_name, run) => run();
RuleTester.it = (_name, run) => run();

const ruleTester = new RuleTester({
	languageOptions: {
		parserOptions: {
			lang: "ts",
		},
		sourceType: "module",
	},
});

test("no-re-exports rejects module re-exports and pure barrel files", () => {
	expect(() => {
		ruleTester.run("no-re-exports", descriptivePlugin.rules["no-re-exports"], {
			valid: [
				{
					code: "export const renderedChartPath = 'chart.png';",
					filename: "feature-entry.ts",
				},
				{
					code: "import { Chart } from './Chart';\nexport const createChart = () => Chart;",
					filename: "index.ts",
				},
			],
			invalid: [
				{
					code: "export * from './Chart';",
					errors: [/Re-export from "\.\/Chart" is not allowed/],
					filename: "feature-entry.ts",
				},
				{
					code: "export { Chart } from './Chart';",
					errors: [
						/Re-export from "\.\/Chart" is not allowed/,
						/Barrel files that only aggregate exports are not allowed/,
					],
					filename: "index.ts",
				},
			],
		});
	}).not.toThrow();
});

test("no-vague-names rejects generic declaration and object names", () => {
	expect(() => {
		ruleTester.run("no-vague-names", descriptivePlugin.rules["no-vague-names"], {
			valid: [
				{
					code: "const renderedChartPath = 'chart.png';\nconst chartOptions = { outputPath: renderedChartPath };",
					filename: "feature.ts",
				},
			],
			invalid: [
				{
					code: "const chartUtils = {};",
					errors: [/Variable "chartUtils" uses the generic term "utils"/],
					filename: "feature.ts",
				},
				{
					code: "const chartOptions = { helper: true };",
					errors: [/Object property "helper" uses the generic term "helper"/],
					filename: "feature.ts",
				},
				{
					code: "function renderChart(helperPath: string) { return helperPath; }",
					errors: [/Parameter "helperPath" uses the generic term "helper"/],
					filename: "feature.ts",
				},
			],
		});
	}).not.toThrow();
});
