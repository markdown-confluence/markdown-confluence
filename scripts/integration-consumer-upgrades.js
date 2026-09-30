import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { Effect } from "effect";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Exercise package boundaries, including a consumer's existing transitive lock entries. */
export async function verifyConsumerUpgrades(tarball, reportDirectory, fs, path, node, version) {
	const join = (...parts) => path.join(...parts);
	const resolve = (filename) => path.resolve(filename);
	const mkdir = (filename) => Effect.runPromise(fs.makeDirectory(filename));
	const readFile = (filename) => Effect.runPromise(fs.readFileString(filename));
	const writeFile = (filename, contents) =>
		Effect.runPromise(fs.writeFileString(filename, contents));
	const directory = await Effect.runPromise(
		fs.makeTempDirectory({ prefix: "confluence-consumer-upgrades-" }),
	);
	const results = [];
	const command = (executable, args, cwd) =>
		execute(executable, args, { cwd, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
	const install = (manager, cwd, candidate) =>
		manager === "npm"
			? command(
					"npm",
					["install", candidate, "--ignore-scripts", "--no-audit", "--no-fund"],
					cwd,
				)
			: command("vp", ["install", "--no-frozen-lockfile"], cwd);
	const importScript = `import assert from 'node:assert/strict';
const library = await import('@markdown-confluence/lib');
assert.equal(library.parseMarkdownToADF('# Consumer regression', 'https://example.atlassian.net').type, 'doc');
const { createRequire } = await import('node:module');
const { pathToFileURL } = await import('node:url');
const libraryRequire = createRequire(import.meta.resolve('@markdown-confluence/lib/package.json'));
const { Effect } = await import(pathToFileURL(libraryRequire.resolve('effect')).href);
const { Path } = await import(pathToFileURL(libraryRequire.resolve('effect/Path')).href);
const { FileSystem } = await import(pathToFileURL(libraryRequire.resolve('effect/FileSystem')).href);
assert.equal(await library.runEffect(Effect.gen(function* () {
 const path = yield* Path; return path.basename('consumer.md');
})), 'consumer.md');
assert.equal(await library.runEffect(Effect.gen(function* () {
 const fs = yield* FileSystem; return yield* fs.readFileString('.node-version');
})), '24.15.0' + String.fromCharCode(10));`;
	try {
		const baseline = join(directory, "baseline");
		await mkdir(baseline);
		// Reproduce the former public boundary without checking generated bundles into Git.
		// The old adapter's broad prerelease edge must remain in the consumer lockfile.
		await writeFile(
			join(baseline, "package.json"),
			JSON.stringify({
				name: "@markdown-confluence/lib",
				version,
				type: "module",
				main: "index.js",
				files: ["index.js"],
				dependencies: { "@effect/platform-node": "4.0.0-rc.112", effect: "4.0.0-rc.112" },
			}),
		);
		await writeFile(
			join(baseline, "index.js"),
			'export { NodeServices } from "@effect/platform-node";\n',
		);
		await command("npm", ["pack", "--ignore-scripts"], baseline);
		const baselineTarball = join(baseline, `markdown-confluence-lib-${version}.tgz`);
		for (const manager of ["npm", "pnpm"]) {
			for (const retainedLock of [false, true]) {
				const cwd = join(directory, `${manager}-${retainedLock ? "upgrade" : "fresh"}`);
				await mkdir(cwd);
				const metadata = {
					private: true,
					type: "module",
					packageManager: "pnpm@11.1.2",
					dependencies: {
						"@markdown-confluence/lib": `file:${retainedLock ? baselineTarball : resolve(tarball)}`,
					},
				};
				await writeFile(join(cwd, ".node-version"), "24.15.0\n");
				await writeFile(
					join(cwd, "pnpm-workspace.yaml"),
					"allowBuilds:\n  msgpackr-extract: false\n",
				);
				await writeFile(join(cwd, "package.json"), JSON.stringify(metadata));
				const result = { manager, retainedLock };
				if (retainedLock) {
					await install(manager, cwd, baselineTarball);
					const lock = manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml";
					const contents = await readFile(join(cwd, lock), "utf8");
					await writeFile(
						join(
							reportDirectory,
							`${manager}-baseline-lock.${manager === "npm" ? "json" : "yaml"}`,
						),
						contents,
					);
					let failed = false;
					try {
						await command(
							node,
							[
								"--input-type=module",
								"-e",
								"await import('@markdown-confluence/lib')",
							],
							cwd,
						);
					} catch (error) {
						assert.match(error.stderr, /ERR_MODULE_NOT_FOUND/);
						assert.match(error.stderr, /effect[\\/]dist[\\/]/);
						result.beforeError = error.stderr;
						failed = true;
					}
					assert.ok(
						failed,
						"The legacy adapter fixture must reproduce the incompatible locked tree",
					);
					metadata.dependencies["@markdown-confluence/lib"] = `file:${resolve(tarball)}`;
					await writeFile(join(cwd, "package.json"), JSON.stringify(metadata));
					// Keep the existing lock and node_modules: no overrides, dedupe or reset.
				}
				await install(manager, cwd, resolve(tarball));
				await command(node, ["--input-type=module", "-e", importScript], cwd);
				result.status = "passed";
				results.push(result);
				console.log(
					`Consumer ${manager} ${retainedLock ? "retained-lock upgrade" : "library-only fresh install"}: passed`,
				);
			}
		}
	} finally {
		await writeFile(
			join(reportDirectory, "consumer-upgrades.json"),
			JSON.stringify(results, null, 2),
		);
		await Effect.runPromise(fs.remove(directory, { recursive: true, force: true }));
	}
	return results;
}
