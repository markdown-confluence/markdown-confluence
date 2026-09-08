import { expect, test } from "@effect/vitest";
import {
	planMutationShards,
	combineMutationShards,
	mutationReportHtml,
} from "./mutation-shards.js";

test("partitions the configured scope exactly once, including nested index files", () => {
	const files = [
		"src/large.ts",
		"src/a.ts",
		"src/nested/index.ts",
		"src/a.test.ts",
		"src/index.ts",
		"outside.ts",
	].map((name, index) => ({ name, size: 100 - index * 10 }));
	const patterns = ["src/**/*.ts", "!src/**/*.test.ts", "!src/index.ts"];
	const shards = planMutationShards(files, patterns, 2);
	expect(shards.flatMap(({ files: names }) => names).sort()).toEqual([
		"src/a.ts",
		"src/large.ts",
		"src/nested/index.ts",
	]);
	expect(planMutationShards([...files].reverse(), patterns, 2)).toEqual(shards);
	expect(shards.every(({ files: names }) => names.length > 0)).toBe(true);
});

const plan = [
	{ id: 1, files: ["src/a.ts", "src/types.ts"] },
	{ id: 2, files: ["src/b.ts"] },
];
function completedReports() {
	return plan.map((shard) => ({
		manifest: {
			...shard,
			mutantCounts: Object.fromEntries(
				shard.files.map((name) => [name, name.endsWith("types.ts") ? 0 : 1]),
			),
		},
		report: {
			schemaVersion: "1.0",
			files: {
				[shard.files[0]]: {
					source: "const value = true;",
					language: "typescript",
					mutants: [
						{
							id: "0",
							status: shard.id === 1 ? "Killed" : "Survived",
							mutatorName: "BooleanLiteral",
							replacement: "false",
							location: {
								start: { line: 1, column: 15 },
								end: { line: 1, column: 19 },
							},
							coveredBy: ["0"],
							killedBy: shard.id === 1 ? ["0"] : [],
						},
					],
				},
			},
			testFiles: { "src/test.ts": { tests: [{ id: "0", name: "checks value" }] } },
		},
	}));
}

test("combines scores and namespaces colliding mutant and test ids", () => {
	const { report, metrics } = combineMutationShards(plan, completedReports(), {
		high: 80,
		low: 60,
		break: 0,
	});
	expect(metrics.totalMutants).toBe(2);
	expect(metrics.mutationScore).toBe(50);
	expect(report.files["shard-1/a.ts"].mutants[0].id).not.toBe(
		report.files["shard-2/b.ts"].mutants[0].id,
	);
	expect(report.files["shard-1/a.ts"].mutants[0].killedBy).toEqual([
		report.testFiles["shard-1/test.ts"].tests[0].id,
	]);
});

test("rejects missing shards, mismatched scope, truncated and unfinished reports", () => {
	expect(() => combineMutationShards(plan, completedReports().slice(1), {})).toThrow("Missing");
	for (const damage of [
		(entries) => {
			entries[1].manifest.id = 1;
		},
		(entries) => {
			entries[0].manifest.files = ["src/wrong.ts"];
		},
		(entries) => {
			entries[0].report.files["src/a.ts"].mutants = [];
		},
		(entries) => {
			entries[0].report.files["src/a.ts"].mutants[0].status = "Pending";
		},
	]) {
		const entries = completedReports();
		damage(entries);
		expect(() => combineMutationShards(plan, entries, {})).toThrow();
	}
});

test("escapes source text that could close the report script element", () => {
	const html = mutationReportHtml(
		{ source: "</script><script>alert(1)</script>" },
		"componentCode();",
	);
	expect(html).not.toContain("</script><script>alert(1)");
	expect(html).toContain("\\u003c/script>");
});
