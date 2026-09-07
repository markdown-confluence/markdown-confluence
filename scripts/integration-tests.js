import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Console, Effect, Stream } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess } from "effect/unstable/process";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
	RuntimeEnvironmentLive,
	RuntimeEnvironmentService,
} from "../packages/lib/src/effects/index.ts";
import { prepareReleaseAssets, releasePackages } from "./prepare-release-assets.js";
import {
	parseIntegrationOptions,
	validateLiveEnvironment,
	liveConnectionSettings,
} from "./integration-options.js";
import { prepareIntegrationVault } from "./integration-vault.js";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const help = `Integration profiles (vp run test:integration [profile] [options]):
  quick      Build, check all fixture conversions and render real Mermaid PNGs (default).
  packages   Pack all five npm packages, install into a fresh consumer and verify them.
  blogs      Publish a blog post; verify attachments, labels, updates and CLI export.
  live       Publish synthetic fixtures to Confluence; verify unchanged/update/recovery.
  regressions Publish 166 notes with Mermaid/images using the released action container.
  docker     Build the local image and exercise its CLI without Confluence credentials.
  vault      Create a dedicated Obsidian fixture vault, or refresh only its plugin build.
  obsidian   Run the desktop plugin test in the prepared, open vault via Obsidian CLI.

  --dataview            Also test Dataview in the obsidian profile (requires Dataview installed).
  --skip-build          Reuse the current build (CI/watch mode; does not check freshness).
  --vault PATH          Dedicated vault path; defaults to ../markdown-confluence-integration-vault.
  --settings-from PATH  Read test credentials from an existing plugin data.json.
  --help                Show this help without building or publishing.

Configuration: .env.integration (see .env.integration.example).
Reports: reports/integration/. See documentation/TESTING.md for coverage and setup.`;

function command(executable, args, options = {}, timeout = "15 minutes") {
	return Effect.scoped(
		Effect.gen(function* () {
			const child = yield* ChildProcess.make(executable, args, {
				cwd: repositoryRoot,
				extendEnv: true,
				stdin: "ignore",
				stdout: options.capture ? "pipe" : "inherit",
				stderr: "inherit",
				...options,
			});
			const [exitCode, output] = yield* Effect.all(
				[
					child.exitCode,
					options.capture
						? child.stdout.pipe(
								Stream.decodeText(),
								Stream.runCollect,
								Effect.map((chunks) => chunks.join("")),
							)
						: Effect.succeed(""),
				],
				{ concurrency: "unbounded" },
			);
			if (exitCode !== (options.expectedExitCode ?? 0))
				return yield* Effect.fail(
					new Error(
						`${executable} exited ${exitCode}; expected ${options.expectedExitCode ?? 0}`,
					),
				);
			return output;
		}),
	).pipe(Effect.timeout(timeout));
}

function readTestEnvironment(options) {
	return Effect.gen(function* () {
		const runtime = yield* RuntimeEnvironmentService;
		const fs = yield* FileSystem;
		const path = yield* Path;
		const settingsFile =
			options.settingsFile ?? (yield* runtime.getEnv("CONFLUENCE_E2E_SETTINGS_FILE"));
		const settings = settingsFile
			? JSON.parse(yield* fs.readFileString(path.resolve(repositoryRoot, settingsFile)))
			: {};
		const mapping = {
			ATLASSIAN_USERNAME: "atlassianUserName",
			ATLASSIAN_API_TOKEN: "atlassianApiToken",
			ATLASSIAN_CLIENT_ID: "atlassianClientId",
			ATLASSIAN_CLIENT_SECRET: "atlassianClientSecret",
			CONFLUENCE_E2E_AUTH_TYPE: undefined,
			CONFLUENCE_E2E_API_URL: undefined,
			CONFLUENCE_E2E_BASE_URL: undefined,
			CONFLUENCE_E2E_PARENT_ID: "confluenceParentId",
			CONFLUENCE_E2E_SPACE_KEY: undefined,
		};
		const environment = {};
		for (const [name, setting] of Object.entries(mapping))
			environment[name] = (yield* runtime.getEnv(name)) || settings[setting];
		environment.CONFLUENCE_E2E_BASE_URL ||=
			settings.confluenceSiteUrl || settings.confluenceBaseUrl;
		if (
			settings.confluenceBaseUrl &&
			new URL(settings.confluenceBaseUrl).hostname === "api.atlassian.com"
		)
			environment.CONFLUENCE_E2E_API_URL ||= settings.confluenceBaseUrl;
		return environment;
	});
}

function normalizeAdf(value) {
	if (Array.isArray(value)) return value.map(normalizeAdf);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => key !== "localId")
				.map(([key, item]) => [key, normalizeAdf(item)]),
		);
	return value;
}

function verifyCli(node, cliPath, cwd, libraryUrl) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		const library = yield* Effect.promise(() => import(libraryUrl));
		const fixtures = path.join(repositoryRoot, "test-fixtures/release-vault");
		let count = 0;
		for (const relative of yield* fs.readDirectory(fixtures, { recursive: true })) {
			if (!relative.endsWith(".md")) continue;
			const filename = path.join(fixtures, relative);
			const markdown = yield* fs.readFileString(filename);
			const output = yield* command(
				node,
				[cliPath, "to-adf", filename, "--base-url", "https://example.atlassian.net"],
				{ cwd, capture: true },
			);
			assert.deepEqual(
				normalizeAdf(JSON.parse(output)),
				normalizeAdf(library.parseMarkdownToADF(markdown, "https://example.atlassian.net")),
				relative,
			);
			count++;
		}
		const conversionRoot = yield* fs.makeTempDirectoryScoped({
			prefix: "confluence-conversion-",
		});
		const adfPath = path.join(
			repositoryRoot,
			"test-fixtures/conversion/rich-document.adf.json",
		);
		const markdownPath = path.join(conversionRoot, "round trip.md");
		const originalAdf = JSON.parse(yield* fs.readFileString(adfPath));
		const spacedAdfPath = path.join(conversionRoot, "input document.adf.json");
		yield* fs.copyFile(adfPath, spacedAdfPath);
		yield* command(
			node,
			[cliPath, "to-markdown", "--input", spacedAdfPath, "--output", markdownPath],
			{ cwd },
		);
		const roundTrip = yield* command(node, [cliPath, "to-adf", markdownPath], {
			cwd,
			capture: true,
		});
		assert.deepEqual(
			JSON.parse(roundTrip),
			originalAdf,
			"Rich ADF file round trip must preserve all fields",
		);
		const stdinMarkdown = yield* command(node, [cliPath, "from-adf", "-", "--readable"], {
			cwd,
			capture: true,
			stdin: Stream.make(new TextEncoder().encode(JSON.stringify(originalAdf))),
		});
		assert.ok(
			stdinMarkdown.includes("Conversion example") &&
				stdinMarkdown.includes("The final paragraph"),
		);
		const invalidOutput = path.join(conversionRoot, "invalid output.md");
		const invalidJson = yield* command(
			node,
			[cliPath, "to-markdown", "-", "--output", invalidOutput],
			{
				cwd,
				capture: true,
				expectedExitCode: 1,
				stdin: Stream.make(new TextEncoder().encode("{invalid")),
			},
		);
		assert.equal(invalidJson, "", "Invalid JSON must not emit Markdown");
		assert.equal(
			yield* fs.exists(invalidOutput),
			false,
			"Invalid input must not create an output file",
		);
		const formatting = path.join(
			repositoryRoot,
			"test-fixtures/conversion/conversion-formatting.md",
		);
		const formattingAdf = JSON.parse(
			yield* command(node, [cliPath, "to-adf", formatting], { cwd, capture: true }),
		);
		assert.ok(JSON.stringify(formattingAdf).includes('"type":"underline"'));
		assert.ok(JSON.stringify(formattingAdf).includes('"align":"center"'));
		const generatedAdfPath = path.join(conversionRoot, "generated page.adf.json");
		yield* command(
			node,
			[cliPath, "to-adf", "--input", formatting, "--output", generatedAdfPath],
			{ cwd },
		);
		assert.deepEqual(JSON.parse(yield* fs.readFileString(generatedAdfPath)), formattingAdf);
		yield* command(node, [cliPath, "to-markdown", generatedAdfPath, "--output", markdownPath], {
			cwd,
		});
		const generatedRoundTrip = JSON.parse(
			yield* command(node, [cliPath, "to-adf", markdownPath], { cwd, capture: true }),
		);
		assert.deepEqual(
			generatedRoundTrip,
			formattingAdf,
			"Markdown file to ADF file to Markdown file preserves generated ADF",
		);

		yield* Console.log(
			"Both conversion commands: file/stdin/output, rich ADF round trip, formatting and invalid input verified.",
		);
		// CommonJS consumers use dynamic import because the public package is ESM.
		yield* command(
			node,
			[
				"--input-type=commonjs",
				"-e",
				`import(${JSON.stringify(libraryUrl)}).then(m => { if (typeof m.parseMarkdownToADF !== 'function') throw Error('Missing public export'); })`,
			],
			{ cwd },
		);
		const invalid = yield* command(node, [cliPath, "to-adf", "--invalid-integration-option"], {
			cwd,
			capture: true,
			expectedExitCode: 1,
		});
		assert.ok(!invalid.trim(), "Failed conversion must not emit an ADF document");
		yield* Console.log(
			`Built CLI matches the library for ${count} Markdown fixtures; CommonJS import and failure exit verified.`,
		);
	});
}

function runIntegration() {
	return Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* Path;
			const runtime = yield* RuntimeEnvironmentService;
			const argv = yield* runtime.argv;
			const node = argv[0];
			const options = parseIntegrationOptions(argv.slice(2));
			if (options.help) return yield* Console.log(help);
			const runId = `${options.profile}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
			const reportDirectory = path.join(repositoryRoot, "reports/integration", runId);
			yield* fs.makeDirectory(reportDirectory, { recursive: true });
			const report = {
				profile: options.profile,
				startedAt: new Date().toISOString(),
				reusedBuild: options.skipBuild,
				status: "running",
				steps: [],
			};
			const step = (name, task) =>
				Effect.gen(function* () {
					const started = Date.now();
					yield* Console.log(`\n[integration] ${name}`);
					return yield* task.pipe(
						Effect.onExit((exit) =>
							Effect.sync(() => {
								report.steps.push({
									name,
									status: exit._tag === "Success" ? "passed" : "failed",
									durationSeconds: Math.round((Date.now() - started) / 100) / 10,
								});
							}),
						),
					);
				});
			const work = Effect.gen(function* () {
				const live = ["live", "blogs", "regressions", "obsidian"].includes(options.profile);
				const environment = ["live", "blogs", "regressions", "obsidian", "vault"].includes(
					options.profile,
				)
					? yield* readTestEnvironment(options)
					: {};
				if (live) validateLiveEnvironment(environment);
				if (!options.skipBuild)
					yield* step("Build workspace", command("vp", ["run", "build"]));
				yield* step("Validate release artifacts", prepareReleaseAssets(repositoryRoot));
				const vaultPath = path.resolve(
					repositoryRoot,
					options.vault ??
						(yield* runtime.getEnv("CONFLUENCE_E2E_VAULT")) ??
						"../markdown-confluence-integration-vault",
				);
				if (options.profile === "vault") {
					const result = yield* step(
						"Prepare dedicated Obsidian vault",
						prepareIntegrationVault(
							repositoryRoot,
							vaultPath,
							environment.CONFLUENCE_E2E_AUTH_TYPE === "oauth2"
								? liveConnectionSettings(environment)
								: {
										confluenceBaseUrl:
											environment.CONFLUENCE_E2E_API_URL ||
											environment.CONFLUENCE_E2E_BASE_URL,
										confluenceSiteUrl: environment.CONFLUENCE_E2E_BASE_URL,
										confluenceParentId: environment.CONFLUENCE_E2E_PARENT_ID,
										atlassianUserName: environment.ATLASSIAN_USERNAME,
										atlassianApiToken: environment.ATLASSIAN_API_TOKEN,
									},
						),
					);
					report.vault = result;
					yield* Console.log(
						`Open ${vaultPath} in Obsidian and enable Confluence Integration once. Existing notes and settings are preserved on refresh.`,
					);
					return;
				}
				if (options.profile === "obsidian") {
					yield* step(
						"Refresh dedicated test-vault plugin",
						prepareIntegrationVault(repositoryRoot, vaultPath),
					);
					const { runObsidianIntegration } = yield* Effect.promise(
						() => import("./integration-obsidian.js"),
					);
					yield* step(
						"Desktop plugin create/unchanged/update verification",
						runObsidianIntegration({
							dataview: options.dataview,
							vaultPath,
							environment,
							reportDirectory,
						}),
					);
					return;
				}
				if (options.profile === "regressions") {
					yield* step(
						"Container: Mermaid failure/recovery, image cases and publishing scale",
						command(
							node,
							["scripts/integration-regressions.js"],
							{
								env: {
									...environment,
									CONFLUENCE_E2E_REPORT_DIRECTORY: reportDirectory,
								},
							},
							"25 minutes",
						),
					);
					return;
				}
				if (options.profile === "blogs") {
					yield* step(
						"Live blog-post CLI create/update/unchanged/export",
						command(node, ["scripts/integration-blogs.js"], {
							env: {
								...environment,
								CONFLUENCE_E2E_REPORT_PATH: path.join(
									reportDirectory,
									"blogs.json",
								),
							},
						}),
					);
					return;
				}

				if (options.profile === "live") {
					yield* step(
						"Live Confluence create/unchanged/update/recovery",
						command(node, ["scripts/confluence-release-e2e.js"], {
							env: {
								...environment,
								CONFLUENCE_E2E_REPORT_PATH: path.join(
									reportDirectory,
									"confluence.json",
								),
							},
						}),
					);
					return;
				}
				if (options.profile === "docker") {
					yield* step(
						"Build local Docker image",
						command("vp", ["run", "-r", "build:docker"]),
					);
					const fixture = path.join(repositoryRoot, "test-fixtures/release-vault");
					const output = yield* step(
						"Container CLI conversion",
						command(
							"docker",
							[
								"run",
								"--rm",
								"--mount",
								`type=bind,source=${fixture},target=/fixtures,readonly`,
								"markdown-confluence/markdown-confluence",
								"to-adf",
								"/fixtures/Release Tests/Formatting.md",
							],
							{ capture: true },
						),
					);
					assert.equal(JSON.parse(output).type, "doc");
					yield* step(
						"Container rejects unconfigured publishing",
						command(
							"docker",
							["run", "--rm", "markdown-confluence/markdown-confluence"],
							{ expectedExitCode: 1 },
						),
					);
					return;
				}
				let cwd = repositoryRoot;
				let cliPath = path.join(repositoryRoot, "packages/cli/dist/index.js");
				let libraryUrl = pathToFileURL(
					path.join(repositoryRoot, "packages/lib/dist/index.js"),
				).href;
				let resolver = `(name) => new URL('../packages/' + name + '/dist/index.js', import.meta.url).href`;
				let smokePath = path.join(repositoryRoot, "scripts/integration-package-smoke.js");
				if (options.profile === "packages") {
					cwd = yield* fs.makeTempDirectoryScoped({ prefix: "confluence-package-test-" });
					const tarballs = path.join(cwd, "tarballs");
					yield* fs.makeDirectory(tarballs);
					yield* step(
						"Pack all five npm packages",
						command("vp", [
							"pm",
							"pack",
							"-r",
							"--filter",
							"@markdown-confluence/*",
							"--pack-destination",
							tarballs,
						]),
					);
					const rootPackage = JSON.parse(
						yield* fs.readFileString(path.join(repositoryRoot, "package.json")),
					);
					const dependencies = {};
					for (const packageName of releasePackages.filter(
						(name) => name !== "obsidian",
					)) {
						const metadata = JSON.parse(
							yield* fs.readFileString(
								path.join(repositoryRoot, "packages", packageName, "package.json"),
							),
						);
						const tarball = path.join(
							tarballs,
							`${metadata.name.replace("@", "").replace("/", "-")}-${metadata.version}.tgz`,
						);
						assert.ok(yield* fs.exists(tarball), `Missing packed ${metadata.name}`);
						dependencies[metadata.name] = pathToFileURL(tarball).href;
					}
					yield* fs.writeFileString(
						path.join(cwd, "package.json"),
						JSON.stringify({
							private: true,
							type: "module",
							packageManager: rootPackage.packageManager,
							dependencies,
						}),
					);
					yield* fs.copyFile(
						path.join(repositoryRoot, ".node-version"),
						path.join(cwd, ".node-version"),
					);
					// Override internal transitive dependencies too: no published older package may
					// silently substitute for the candidate being tested.
					yield* fs.writeFileString(
						path.join(cwd, "pnpm-workspace.yaml"),
						`overrides: ${JSON.stringify(dependencies)}\nallowBuilds:\n  puppeteer: true\n  msgpackr-extract: false\n  esbuild: false\n  "@parcel/watcher": false\n`,
					);
					yield* step(
						"Install into isolated consumer",
						command("vp", ["install", "--no-frozen-lockfile"], { cwd }),
					);
					for (const packageName of Object.keys(dependencies)) {
						const packageRoot = path.join(cwd, "node_modules", packageName);
						const metadata = JSON.parse(
							yield* fs.readFileString(path.join(packageRoot, "package.json")),
						);
						assert.equal(metadata.version, rootPackage.version);
						if (metadata.types)
							assert.ok(
								yield* fs.exists(path.join(packageRoot, metadata.types)),
								`Missing packed declarations: ${packageName}`,
							);
					}
					report.packages = Object.keys(dependencies).map((name) => ({
						name,
						version: rootPackage.version,
					}));
					cliPath = path.join(cwd, "node_modules/@markdown-confluence/cli/dist/index.js");
					libraryUrl = pathToFileURL(
						path.join(cwd, "node_modules/@markdown-confluence/lib/dist/index.js"),
					).href;
					const consumerSmoke = path.join(cwd, "integration-package-smoke.js");
					yield* fs.copyFile(smokePath, consumerSmoke);
					smokePath = consumerSmoke;
					resolver = `(name) => '@markdown-confluence/' + name`;
				}
				// Resolve workspace paths from the smoke module, not from the child's cwd.
				const runner = `import { verifyPackageImports } from ${JSON.stringify(pathToFileURL(smokePath).href)}; await verifyPackageImports(${options.profile === "packages" ? resolver : `(name) => ${JSON.stringify(pathToFileURL(path.join(repositoryRoot, "packages/")).href)} + name + '/dist/index.js'`});`;
				yield* step(
					"ESM imports and diagram rendering",
					command(node, ["--input-type=module", "-e", runner], { cwd }),
				);
				yield* step(
					"CLI fixture parity and error handling",
					verifyCli(node, cliPath, cwd, libraryUrl),
				);
			});
			yield* work.pipe(
				Effect.onExit((exit) =>
					Effect.gen(function* () {
						report.status = exit._tag === "Success" ? "passed" : "failed";
						report.finishedAt = new Date().toISOString();
						report.commit = (yield* command("git", ["rev-parse", "HEAD"], {
							capture: true,
						}).pipe(Effect.catch(() => Effect.succeed("")))).trim();
						report.workingTreeDirty = Boolean(
							(yield* command("git", ["status", "--porcelain"], {
								capture: true,
							}).pipe(Effect.catch(() => Effect.succeed("")))).trim(),
						);
						yield* fs.writeFileString(
							path.join(reportDirectory, "summary.json"),
							JSON.stringify(report, null, 2),
						);
						const markdown = `## Integration: ${options.profile} — ${report.status}\n\n${report.steps.map((entry) => `- ${entry.status}: ${entry.name} (${entry.durationSeconds}s)`).join("\n")}\n`;
						yield* fs.writeFileString(
							path.join(reportDirectory, "summary.md"),
							markdown,
						);
						const summaryPath = yield* runtime.getEnv("GITHUB_STEP_SUMMARY");
						if (summaryPath)
							yield* fs.writeFileString(summaryPath, markdown, { flag: "a" });
						yield* Console.log(
							`\nIntegration ${report.status}. Report: ${path.join(reportDirectory, "summary.json")}`,
						);
					}),
				),
			);
		}),
	);
}

if (import.meta.main)
	NodeRuntime.runMain(
		runIntegration().pipe(
			Effect.provide(NodeServices.layer),
			Effect.provide(RuntimeEnvironmentLive),
		),
	);
