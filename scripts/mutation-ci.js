import { fileURLToPath } from "node:url";
import { Console, Effect, Stream } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess } from "effect/unstable/process";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
	RuntimeEnvironmentLive,
	RuntimeEnvironmentService,
} from "../packages/lib/src/effects/index.ts";
import config from "../stryker.config.mjs";
import {
	planMutationShards,
	combineMutationShards,
	mutationReportHtml,
} from "./mutation-shards.js";

function readMutationPlan() {
	return Effect.scoped(
		Effect.gen(function* () {
			const filesystem = yield* FileSystem;
			const child = yield* ChildProcess.make("git", ["ls-files", "-z"], {
				stdout: "pipe",
				stderr: "inherit",
			});
			const [exitCode, output] = yield* Effect.all(
				[
					child.exitCode,
					child.stdout.pipe(
						Stream.decodeText(),
						Stream.runCollect,
						Effect.map((chunks) => chunks.join("")),
					),
				],
				{ concurrency: "unbounded" },
			);
			if (exitCode !== 0)
				return yield* Effect.fail(new Error("Cannot enumerate mutation source files"));
			const files = yield* Effect.forEach(
				output.split("\0").filter(Boolean),
				(name) =>
					filesystem
						.stat(name)
						.pipe(Effect.map((stat) => ({ name, size: Number(stat.size) }))),
				{ concurrency: 16 },
			);
			return planMutationShards(files, config.mutate);
		}),
	);
}

function runMutationCi() {
	return Effect.gen(function* () {
		const filesystem = yield* FileSystem;
		const path = yield* Path;
		const runtime = yield* RuntimeEnvironmentService;
		const [command, argument] = (yield* runtime.argv)
			.slice(2)
			.filter((value) => value !== "--");
		const plan = yield* readMutationPlan();
		if (command === "plan") return yield* Console.log(JSON.stringify(plan, null, 2));
		if (command === "run") {
			const shard = plan.find(({ id }) => String(id) === argument);
			if (!shard) return yield* Effect.fail(new Error("Invalid mutation shard number"));
			yield* filesystem.makeDirectory("reports/mutation", { recursive: true });
			yield* filesystem.remove("reports/mutation/complete.json", { force: true });
			yield* Console.log(
				`Mutation shard ${shard.id}/${plan.length}: ${shard.files.join(", ")}`,
			);
			const { Stryker } = yield* Effect.promise(() => import("@stryker-mutator/core"));
			const results = yield* Effect.promise(() =>
				new Stryker({
					mutate: shard.files,
					// Enforce the configured score once, on the combined report.
					thresholds: { ...config.thresholds, break: null },
				}).runMutationTest(),
			);
			const mutantCounts = Object.fromEntries(shard.files.map((name) => [name, 0]));
			for (const result of results) {
				const filename = path
					.relative(yield* runtime.cwd, result.fileName)
					.split(path.sep)
					.join("/");
				if (!(filename in mutantCounts))
					return yield* Effect.fail(new Error(`Unexpected mutant file: ${filename}`));
				mutantCounts[filename]++;
			}
			yield* filesystem.writeFileString(
				"reports/mutation/complete.json",
				JSON.stringify({ ...shard, mutantCounts }),
			);
			return;
		}
		if (command !== "aggregate")
			return yield* Effect.fail(new Error("Expected plan, run <shard>, or aggregate"));
		const completed = yield* Effect.forEach(plan, (shard) =>
			Effect.gen(function* () {
				const directory = `reports/mutation-shards/mutation-shard-${shard.id}`;
				return {
					manifest: JSON.parse(
						yield* filesystem.readFileString(`${directory}/complete.json`),
					),
					report: JSON.parse(
						yield* filesystem.readFileString(`${directory}/mutation.json`),
					),
				};
			}),
		);
		const { report, metrics } = combineMutationShards(plan, completed, config.thresholds);
		const componentScript = yield* filesystem.readFileString(
			fileURLToPath(
				import.meta.resolve("mutation-testing-elements/mutation-test-elements.js"),
			),
		);
		yield* filesystem.makeDirectory("reports/mutation", { recursive: true });
		yield* filesystem.writeFileString("reports/mutation/mutation.json", JSON.stringify(report));
		yield* filesystem.writeFileString(
			"reports/mutation/mutation.html",
			mutationReportHtml(report, componentScript),
		);
		const summary = `Mutation testing: ${metrics.totalMutants} mutants across ${plan.length} shards; score ${metrics.mutationScore.toFixed(2)}%.\n`;
		yield* filesystem.writeFileString(
			"reports/mutation/summary.json",
			JSON.stringify(metrics, null, 2),
		);
		const summaryPath = yield* runtime.getEnv("GITHUB_STEP_SUMMARY");
		if (summaryPath) yield* filesystem.writeFileString(summaryPath, summary, { flag: "a" });
		yield* Console.log(summary);
		if (metrics.mutationScore < config.thresholds.break)
			return yield* Effect.fail(
				new Error(`Mutation score is below ${config.thresholds.break}%`),
			);
	});
}

if (import.meta.main)
	NodeRuntime.runMain(
		runMutationCi().pipe(
			Effect.provide(NodeServices.layer),
			Effect.provide(RuntimeEnvironmentLive),
		),
	);
