import { minimatch } from "minimatch";
import { aggregateResultsByModule, calculateMutationTestMetrics } from "mutation-testing-metrics";

export const mutationShardCount = 8;

export function planMutationShards(sourceFiles, patterns, count = mutationShardCount) {
	if (!Number.isInteger(count) || count < 1) throw new Error("Invalid mutation shard count");
	const included = patterns.filter((pattern) => !pattern.startsWith("!"));
	const excluded = patterns
		.filter((pattern) => pattern.startsWith("!"))
		.map((pattern) => pattern.slice(1));
	const selected = sourceFiles.filter(
		({ name }) =>
			included.some((pattern) => minimatch(name, pattern)) &&
			!excluded.some((pattern) => minimatch(name, pattern)),
	);
	if (new Set(selected.map(({ name }) => name)).size !== selected.length)
		throw new Error("Duplicate mutation source file");
	if (selected.length < count) throw new Error("Not enough mutation source files for all shards");
	const shards = Array.from({ length: count }, (_, index) => ({
		id: index + 1,
		files: [],
		size: 0,
	}));
	selected.sort(
		(left, right) => right.size - left.size || left.name.localeCompare(right.name, "en"),
	);
	for (const source of selected) {
		const shard = shards.reduce((smallest, current) =>
			current.size < smallest.size ? current : smallest,
		);
		shard.files.push(source.name);
		shard.size += source.size;
	}
	return shards.map((shard) => ({ ...shard, files: shard.files.sort() }));
}

export function combineMutationShards(plan, completed, thresholds) {
	if (completed.length !== plan.length) throw new Error("Missing mutation shard reports");
	const reports = {};
	const completedStatuses = new Set([
		"Killed",
		"Survived",
		"Timeout",
		"NoCoverage",
		"CompileError",
		"RuntimeError",
		"Ignored",
	]);
	for (const shard of plan) {
		const entries = completed.filter(({ manifest }) => manifest.id === shard.id);
		if (entries.length !== 1)
			throw new Error(`Missing or duplicate mutation shard ${shard.id}`);
		const { manifest, report } = entries[0];
		if (JSON.stringify(manifest.files) !== JSON.stringify(shard.files))
			throw new Error(`Mutation scope mismatch in shard ${shard.id}`);
		if (Object.keys(report.files).some((name) => !shard.files.includes(name)))
			throw new Error(`Unexpected mutation source in shard ${shard.id}`);
		for (const filename of shard.files) {
			const expected = manifest.mutantCounts[filename];
			const mutants = report.files[filename]?.mutants ?? [];
			if (
				!Number.isInteger(expected) ||
				expected < 0 ||
				mutants.length !== expected ||
				mutants.some(({ status }) => !completedStatuses.has(status))
			)
				throw new Error(`Incomplete mutation report for ${filename}`);
		}
		reports[`shard-${shard.id}`] = report;
	}
	const report = aggregateResultsByModule(reports);
	report.thresholds = thresholds;
	const metrics = calculateMutationTestMetrics(report).systemUnderTestMetrics.metrics;
	if (metrics.totalMutants === 0) throw new Error("Mutation reports contain no mutants");
	return { report, metrics };
}

export function mutationReportHtml(report, componentScript) {
	const reportJson = JSON.stringify(report).replaceAll("<", "\\u003c");
	return `<!doctype html><html><head><meta charset="utf-8"><title>Mutation testing</title><script>${componentScript}</script></head><body><mutation-test-report-app></mutation-test-report-app><script>document.querySelector('mutation-test-report-app').report = ${reportJson};</script></body></html>`;
}
