import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path as EffectPath } from "effect/Path";
import { RuntimeEnvironmentService } from "../packages/lib/src/effects/index.ts";
import { fileURLToPath } from "node:url";
import {
	ConfluenceUploadSettings,
	createAuthenticatedConfluenceClient,
	runEffect,
} from "../packages/lib/dist/index.js";
import { liveConnectionSettings } from "./integration-options.js";

await runEffect(
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* EffectPath;
			const runtime = yield* RuntimeEnvironmentService;
			const environment = {};
			for (const name of [
				"PATH",
				"HOME",
				"DOCKER_HOST",
				"DOCKER_CONTEXT",
				"ATLASSIAN_USERNAME",
				"ATLASSIAN_API_TOKEN",
				"ATLASSIAN_CLIENT_ID",
				"ATLASSIAN_CLIENT_SECRET",
				"CONFLUENCE_E2E_AUTH_TYPE",
				"CONFLUENCE_E2E_API_URL",
				"CONFLUENCE_E2E_BASE_URL",
				"CONFLUENCE_E2E_PARENT_ID",
				"CONFLUENCE_E2E_SPACE_KEY",
				"CONFLUENCE_E2E_IMAGE",
				"CONFLUENCE_E2E_REPORT_DIRECTORY",
			]) {
				const value = yield* runtime.getEnv(name);
				if (value !== undefined) environment[name] = value;
			}
			const root = yield* fs.makeTempDirectoryScoped({ prefix: "confluence-regressions-" });
			const copyFile = (from, to) => Effect.runPromise(fs.copyFile(from, to));
			const mkdir = (name) => Effect.runPromise(fs.makeDirectory(name));
			const readFile = (name) => Effect.runPromise(fs.readFileString(name));
			const writeFile = (name, contents) =>
				Effect.runPromise(fs.writeFileString(name, contents));
			return yield* Effect.tryPromise(async () => {
				const connection = liveConnectionSettings(environment);
				const image =
					environment.CONFLUENCE_E2E_IMAGE || "ghcr.io/markdown-confluence/publish:6.0.0";
				const reportDirectory = environment.CONFLUENCE_E2E_REPORT_DIRECTORY;
				assert.ok(
					reportDirectory,
					"Run through vp run test:integration regressions for reports",
				);
				const runId = Date.now();
				const prefix = `Regression ${runId}`;
				const client = await runEffect(
					createAuthenticatedConfluenceClient({
						...ConfluenceUploadSettings.DEFAULT_SETTINGS,
						...connection,
					}),
				);
				const parent = await client.content.getContentById({
					id: connection.confluenceParentId,
					expand: ["space"],
				});
				assert.equal(
					parent.space?.key,
					environment.CONFLUENCE_E2E_SPACE_KEY,
					"Refusing to publish outside the dedicated space",
				);
				const report = { image, runId, status: "running", steps: [], pages: [] };
				const secrets = [
					connection.atlassianApiToken,
					connection.atlassianClientSecret,
				].filter(Boolean);
				const redact = (text) =>
					secrets.reduce((value, secret) => value.replaceAll(secret, "[REDACTED]"), text);
				const record = async () =>
					writeFile(
						path.join(reportDirectory, "regressions.json"),
						JSON.stringify(report, null, 2),
					);
				const imageSource = fileURLToPath(
					new URL("../test-fixtures/release-vault/assets/blue.png", import.meta.url),
				);
				const svgSource = fileURLToPath(
					new URL("../test-fixtures/release-vault/assets/green.svg", import.meta.url),
				);

				async function publish(
					name,
					folder = "docs",
					protocolTimeout = "180000",
					expectedCode = 0,
				) {
					const started = Date.now();
					const container = `confluence-regression-${runId}-${name}`;
					console.log(`[regressions] ${name}: publishing ${folder} with ${image}`);
					const env = {
						...environment,
						CONFLUENCE_BASE_URL: connection.confluenceBaseUrl,
						CONFLUENCE_SITE_URL: connection.confluenceSiteUrl,
						CONFLUENCE_PARENT_ID: connection.confluenceParentId,
						CONFLUENCE_AUTH_TYPE: connection.confluenceAuthType,
						ATLASSIAN_USERNAME: connection.atlassianUserName,
						ATLASSIAN_API_TOKEN: connection.atlassianApiToken,
						ATLASSIAN_CLIENT_ID: connection.atlassianClientId,
						ATLASSIAN_CLIENT_SECRET: connection.atlassianClientSecret,
						CONFLUENCE_CONTENT_ROOT:
							folder === "failure"
								? "/github/workspace/failure"
								: "/github/workspace",
						FOLDER_TO_PUBLISH: folder === "failure" ? "." : folder,
						CONFLUENCE_MERMAID_PROTOCOL_TIMEOUT: protocolTimeout,
					};
					const keys = [
						"CONFLUENCE_BASE_URL",
						"CONFLUENCE_SITE_URL",
						"CONFLUENCE_PARENT_ID",
						"CONFLUENCE_AUTH_TYPE",
						"ATLASSIAN_USERNAME",
						"ATLASSIAN_API_TOKEN",
						"ATLASSIAN_CLIENT_ID",
						"ATLASSIAN_CLIENT_SECRET",
						"CONFLUENCE_CONTENT_ROOT",
						"FOLDER_TO_PUBLISH",
						"CONFLUENCE_MERMAID_PROTOCOL_TIMEOUT",
					];
					let output = "";
					let timedOut = false;
					const exitCode = await new Promise((resolve, reject) => {
						const child = spawn(
							"docker",
							[
								"run",
								"--rm",
								"--name",
								container,
								"--user",
								"root",
								"--workdir",
								"/github/workspace",
								"--mount",
								`type=bind,source=${root},target=/github/workspace`,
								...keys.flatMap((key) => ["--env", key]),
								image,
							],
							{ env, stdio: ["ignore", "pipe", "pipe"] },
						);
						const timer = setTimeout(() => {
							timedOut = true;
							const cleanup = spawn("docker", ["rm", "--force", container], {
								stdio: "ignore",
							});
							cleanup.once("close", () => child.kill("SIGKILL"));
						}, 10 * 60_000);
						child.stdout.on("data", (data) => (output += data));
						child.stderr.on("data", (data) => (output += data));
						child.once("error", (error) => {
							clearTimeout(timer);
							reject(error);
						});
						child.once("close", (code) => {
							clearTimeout(timer);
							resolve(code);
						});
					});
					await writeFile(path.join(reportDirectory, `${name}.log`), redact(output));
					const durationSeconds = Math.round((Date.now() - started) / 100) / 10;
					report.steps.push({ name, exitCode, expectedCode, durationSeconds, timedOut });
					await record();
					assert.equal(timedOut, false, `${name} exceeded the 10-minute limit`);
					assert.equal(exitCode, expectedCode, `${name}: ${redact(output).slice(-3000)}`);
					console.log(
						`[regressions] ${name}: exit ${exitCode} as expected in ${durationSeconds}s`,
					);
					return output;
				}

				async function pageFor(filename) {
					const source = await readFile(path.join(root, filename), "utf8");
					const id = source.match(/^connie-page-id: ['"]?(\d+)/m)?.[1];
					assert.ok(id, `${filename} was not published`);
					return client.content.getContentById({
						id,
						expand: ["body.atlas_doc_format", "version", "space"],
					});
				}

				async function snapshot(files) {
					const result = {};
					for (const filename of files) {
						const page = await pageFor(filename);
						assert.equal(page.space?.key, environment.CONFLUENCE_E2E_SPACE_KEY);
						const adf = JSON.parse(page.body.atlas_doc_format.value);
						// Confluence may add/remove these cached details without a page update.
						// Keep strict equality for authored media, page/attachment versions and IDs.
						for (const media of nodes(adf, "media")) {
							delete media.attrs.__fileName;
							delete media.attrs.__fileSize;
							delete media.attrs.__fileMimeType;
						}
						const attachments = await client.contentAttachments.getAttachments({
							id: page.id,
							expand: ["version"],
							limit: 250,
						});
						result[filename] = {
							id: page.id,
							version: page.version.number,
							adf,
							attachments: attachments.results
								.map((item) => ({
									id: item.id,
									title: item.title,
									version: item.version.number,
								}))
								.sort((left, right) => left.id.localeCompare(right.id)),
						};
					}
					return result;
				}

				function nodes(adf, type) {
					return [
						...(adf.type === type ? [adf] : []),
						...(adf.content ?? []).flatMap((child) => nodes(child, type)),
					];
				}

				try {
					// A folder note maps to the configured parent. Create a parent owned by this
					// run so the test never replaces the existing test-space landing page.
					const testParent = await client.content.createContent({
						type: "page",
						title: `${prefix} Root`,
						space: { key: environment.CONFLUENCE_E2E_SPACE_KEY },
						ancestors: [{ id: connection.confluenceParentId }],
						body: {
							atlas_doc_format: {
								representation: "atlas_doc_format",
								value: JSON.stringify({
									type: "doc",
									version: 1,
									content: [
										{
											type: "paragraph",
											content: [
												{ type: "text", text: "Dedicated regression test" },
											],
										},
									],
								}),
							},
						},
					});
					connection.confluenceParentId = testParent.id;
					report.parentId = testParent.id;
					await mkdir(path.join(root, "docs"));
					await mkdir(path.join(root, "assets"));
					for (const filename of [
						"blue.png",
						"blue image.png",
						"parentheses (1).png",
						"café.png",
					])
						await copyFile(imageSource, path.join(root, "assets", filename));
					await copyFile(svgSource, path.join(root, "assets/green.svg"));
					const files = [];
					for (let index = 0; index < 166; index++) {
						const filename =
							index === 0
								? "docs/docs.md"
								: `docs/Note ${String(index).padStart(3, "0")}.md`;
						files.push(filename);
						let body = `---\nconnie-title: ${prefix} ${index === 0 ? "Root" : `Note ${index}`}\n---\n# Synthetic note ${index}\n\nVerification for publish-action #4 and #3.\n`;
						if (index % 10 === 0)
							body += `\n\`\`\`mermaid\nflowchart LR\n  A[Note ${index}] --> B[Rendered] --> C[Published]\n\`\`\`\n`;
						if (index === 1)
							body += [
								"\n## PNG",
								"![PNG](../assets/blue.png)",
								"## Space in filename",
								"![Space](<../assets/blue image.png>)",
								"## Encoded space",
								"![Encoded](../assets/blue%20image.png)",
								"## Parentheses",
								"![Parentheses](<../assets/parentheses (1).png>)",
								"## Unicode",
								"![Unicode](../assets/café.png)",
								"## SVG",
								"![SVG](../assets/green.svg)",
								"## Wiki image",
								"![[assets/blue.png|64]]",
								"## Public remote image",
								"![Remote](https://raw.githubusercontent.com/markdown-confluence/markdown-confluence/main/test-fixtures/release-vault/assets/blue.png)",
							].join("\n\n");
						await writeFile(path.join(root, filename), body);
					}
					const firstOutput = await publish("create");
					assert.equal((firstOutput.match(/SUCCESS:/g) ?? []).length, 166);
					console.log("[regressions] Verifying all 166 pages and attachment versions");
					const before = await snapshot(files);
					assert.equal(Object.keys(before).length, 166);
					const media = before["docs/Note 001.md"];
					assert.equal(
						nodes(media.adf, "media").filter((node) => node.attrs.type === "file")
							.length,
						7,
						"Every supported local image must become native media",
					);
					assert.equal(
						media.attachments.length,
						5,
						"Repeated references must reuse the same attachment",
					);
					for (const node of nodes(media.adf, "media").filter(
						(node) => node.attrs.type === "file",
					)) {
						assert.ok(
							node.attrs.id && node.attrs.collection,
							"Native media needs an attachment ID and collection",
						);
						assert.equal(
							node.attrs.url,
							undefined,
							"Local image URLs must be replaced",
						);
					}
					let diagramCount = 0;
					for (const page of Object.values(before))
						diagramCount += page.attachments.filter((item) =>
							item.title.startsWith("RenderedMermaidChart-"),
						).length;
					assert.equal(diagramCount, 17);
					report.pages = Object.values(before).map((page) => ({
						id: page.id,
						version: page.version,
					}));
					report.imagePageUrl = `${connection.confluenceSiteUrl}/wiki/spaces/${environment.CONFLUENCE_E2E_SPACE_KEY}/pages/${media.id}`;
					report.diagramCount = diagramCount;
					report.sourceNotes = 166;
					await writeFile(
						path.join(reportDirectory, "images.adf.json"),
						JSON.stringify(media.adf, null, 2),
					);
					await record();
					await publish("unchanged");
					const after = await snapshot(files);
					assert.deepEqual(
						after,
						before,
						"Unchanged publishing must preserve all page bodies, versions and attachments",
					);

					const failureParent = await client.content.createContent({
						type: "page",
						title: `${prefix} Failure tests`,
						space: { key: environment.CONFLUENCE_E2E_SPACE_KEY },
						ancestors: [{ id: testParent.id }],
						body: {
							atlas_doc_format: {
								representation: "atlas_doc_format",
								value: JSON.stringify({ type: "doc", version: 1, content: [] }),
							},
						},
					});
					connection.confluenceParentId = failureParent.id;
					report.failureParentId = failureParent.id;
					await mkdir(path.join(root, "failure"));
					const failureFile = path.join(root, "failure/failure.md");
					const frontmatter = `---\nconnie-title: ${prefix} Diagram recovery\n---\n`;
					await writeFile(
						failureFile,
						`${frontmatter}\n\`\`\`mermaid\nnot a valid diagram syntax\n\`\`\`\n`,
					);
					const failed = await publish("invalid-diagram", "failure", "180000", 1);
					assert.match(
						failed,
						/No diagram type detected|Parse error|Syntax error|UnknownDiagramError/i,
					);
					const invalidSource = await readFile(failureFile, "utf8");
					await writeFile(
						failureFile,
						invalidSource.replace(
							"not a valid diagram syntax",
							"flowchart LR\nA --> B",
						),
					);
					await publish("diagram-recovery", "failure");
					const recovered = await pageFor("failure/failure.md");
					const timeoutOutput = await publish("protocol-timeout", "failure", "1", 1);
					assert.match(timeoutOutput, /timed out|timeout/i);
					assert.equal(
						(await pageFor("failure/failure.md")).version.number,
						recovered.version.number,
					);
					await publish("timeout-recovery", "failure");
					assert.equal(
						(await pageFor("failure/failure.md")).version.number,
						recovered.version.number,
					);
					report.status = "passed";
					console.log(
						`[regressions] Passed. Inspect image rendering at ${report.imagePageUrl}`,
					);
				} catch (error) {
					report.status = "failed";
					report.error = redact(error instanceof Error ? error.message : String(error));
					throw error;
				} finally {
					await record();
				}
			});
		}),
	),
);
