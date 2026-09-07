import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path as EffectPath } from "effect/Path";
import {
	createAuthenticatedConfluenceClient,
	ConfluenceUploadSettings,
	RuntimeEnvironmentService,
	runEffect,
} from "../packages/lib/dist/index.js";
import { liveConnectionSettings } from "./integration-options.js";

await runEffect(
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const path = yield* EffectPath;
			const runtime = yield* RuntimeEnvironmentService;
			const argv = yield* runtime.argv;
			const node = argv[0];
			const environment = {};
			for (const name of [
				"PATH",
				"HOME",
				"ATLASSIAN_USERNAME",
				"ATLASSIAN_API_TOKEN",
				"ATLASSIAN_CLIENT_ID",
				"ATLASSIAN_CLIENT_SECRET",
				"CONFLUENCE_E2E_AUTH_TYPE",
				"CONFLUENCE_E2E_API_URL",
				"CONFLUENCE_E2E_BASE_URL",
				"CONFLUENCE_E2E_PARENT_ID",
				"CONFLUENCE_E2E_SPACE_KEY",
				"CONFLUENCE_E2E_REPORT_PATH",
			]) {
				const value = yield* runtime.getEnv(name);
				if (value !== undefined) environment[name] = value;
			}
			const root = yield* fs.makeTempDirectoryScoped({ prefix: "confluence-blog-tests-" });
			const copyFile = (from, to) => Effect.runPromise(fs.copyFile(from, to));
			const mkdir = (name) => Effect.runPromise(fs.makeDirectory(name));
			const readFile = (name) => Effect.runPromise(fs.readFileString(name));
			const writeFile = (name, contents) =>
				Effect.runPromise(fs.writeFileString(name, contents));
			return yield* Effect.tryPromise(async () => {
				const connection = liveConnectionSettings(environment);
				const client = await Effect.runPromise(
					createAuthenticatedConfluenceClient({
						...ConfluenceUploadSettings.DEFAULT_SETTINGS,
						...connection,
					}),
				);
				const parent = await client.content.getContentById({
					id: connection.confluenceParentId,
				});
				assert.equal(
					parent.space?.key,
					environment.CONFLUENCE_E2E_SPACE_KEY,
					"Refusing to publish outside the test space",
				);
				const cli = fileURLToPath(
					new URL("../packages/cli/dist/index.js", import.meta.url),
				);
				const exec = promisify(execFile);
				const prefix = `Blog E2E ${Date.now()} ${randomUUID().slice(0, 8)}`;
				await mkdir(path.join(root, "posts"));
				await copyFile(
					fileURLToPath(
						new URL("../test-fixtures/release-vault/assets/blue.png", import.meta.url),
					),
					path.join(root, "posts/blue.png"),
				);
				const file = path.join(root, "posts/Post.md");
				await writeFile(
					file,
					`---\nconnie-title: ${prefix}\nconnie-content-type: blogpost\ntags: [blog-test, original-label]\n---\n# Blog integration test\n\nPublished blog content.\n\n![Test image](blue.png)\n`,
				);
				await writeFile(
					path.join(root, ".markdown-confluence.json"),
					JSON.stringify({
						...connection,
						atlassianApiToken: undefined,
						atlassianClientSecret: undefined,
						contentRoot: root,
						folderToPublish: "posts",
					}),
				);
				const publish = async () => {
					try {
						return (
							await exec(node, [cli], {
								cwd: root,
								env: environment,
								timeout: 120000,
							})
						).stdout;
					} catch (error) {
						let details = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
						for (const secret of [
							connection.atlassianApiToken,
							connection.atlassianClientSecret,
						].filter(Boolean))
							details = details.replaceAll(secret, "[REDACTED]");
						throw new Error(`Built CLI blog publication failed: ${details}`);
					}
				};
				await publish();
				const markdown = await readFile(file);
				const id = markdown.match(/^connie-page-id:\s*['"]?(\d+)/m)?.[1];
				assert.ok(id, "Blog publication must write its content ID to the input file");
				const snapshot = async () => {
					const page = await client.content.getContentById({ id });
					assert.equal(page.type, "blogpost");
					assert.equal(page.space.key, parent.space.key);
					const attachments = await client.contentAttachments.getAttachments({ id });
					const labels = await client.contentLabels.getLabelsForContent({ id });
					return {
						id,
						version: page.version.number,
						body: JSON.parse(page.body.atlas_doc_format.value, (key, value) =>
							[
								"__fileSize",
								"__fileName",
								"__fileMimeType",
								"__confluenceMetadata",
							].includes(key)
								? undefined
								: value,
						),
						attachments: attachments.results.map((item) => ({
							id: item.id,
							version: item.version.number,
						})),
						labels: labels.results.map((item) => item.name).sort(),
					};
				};
				const first = await snapshot();
				assert.equal(first.attachments.length, 1);
				assert.ok(first.labels.includes("original-label"));
				await publish();
				assert.deepEqual(
					await snapshot(),
					first,
					"Unchanged blog publishing must preserve body, attachments, labels and version",
				);
				await writeFile(
					file,
					markdown.replace("original-label", "updated-label") +
						"\nUpdated blog content.\n",
				);
				await publish();
				const updated = await snapshot();
				assert.equal(updated.version, first.version + 1);
				assert.ok(JSON.stringify(updated.body).includes("Updated blog content."));
				assert.ok(updated.labels.includes("updated-label"));
				assert.ok(!updated.labels.includes("original-label"));
				assert.deepEqual(updated.attachments, first.attachments);
				await publish();
				assert.deepEqual(await snapshot(), updated);
				const output = path.join(root, "blog.adf.json");
				await exec(node, [cli, "to-adf", "--page", id, "--output", output], {
					cwd: root,
					env: environment,
					timeout: 60000,
				});
				assert.deepEqual(
					JSON.parse(await readFile(output), (key, value) =>
						[
							"__fileSize",
							"__fileName",
							"__fileMimeType",
							"__confluenceMetadata",
						].includes(key)
							? undefined
							: value,
					),
					updated.body,
				);
				const report = {
					status: "passed",
					authentication: connection.confluenceAuthType,
					id,
					version: updated.version,
					checks: [
						"blog-create",
						"blog-attachments",
						"blog-label-add-remove",
						"blog-update",
						"blog-unchanged",
						"blog-export",
					],
				};
				await writeFile(
					environment.CONFLUENCE_E2E_REPORT_PATH,
					JSON.stringify(report, null, 2),
				);
				console.log(JSON.stringify(report));
			});
		}),
	),
);
