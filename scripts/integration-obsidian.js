import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { RuntimeEnvironmentService } from "../packages/lib/src/effects/index.ts";
import { vaultMarker } from "./integration-vault.js";
import { runDataviewIntegration } from "./integration-dataview.js";

const publishedNotes = [
	"Release Tests/Release Tests.md",
	"Release Tests/Formatting.md",
	"Release Tests/Media.md",
	"Release Tests/Embeds.md",
	"Release Tests/Hierarchy/README.md",
	"Release Tests/Hierarchy/Child.md",
	"Tagged/Tag selection.md",
];

export function parseObsidianOutput(output) {
	const line = output.split("\n").find((entry) => entry.startsWith("=> "));
	assert.ok(
		line,
		"Obsidian CLI did not return a result. Enable Settings > General > Command line interface and open the test vault.",
	);
	return JSON.parse(line.slice(3));
}

/** Test the installed plugin in the real Electron/Obsidian runtime, without a UI mock. */
export function runObsidianIntegration({
	vaultPath,
	environment,
	reportDirectory,
	dataview = false,
}) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		const runtime = yield* RuntimeEnvironmentService;
		const marker = JSON.parse(yield* fs.readFileString(path.join(vaultPath, vaultMarker)));
		assert.equal(marker.kind, "markdown-confluence-integration", "Run test:vault first");
		const executable = (yield* runtime.getEnv("OBSIDIAN_CLI")) || "obsidian";
		const desktopCommand = (args) =>
			Effect.tryPromise(
				() =>
					new Promise((resolve, reject) => {
						execFile(
							executable,
							args,
							{ cwd: vaultPath, timeout: 180000, maxBuffer: 1024 * 1024 },
							(error, stdout) => {
								if (error)
									reject(
										new Error(
											`Obsidian CLI failed (${error.code ?? "launch error"})`,
										),
									);
								else resolve(stdout);
							},
						);
					}),
			);
		const baseUrl = environment.CONFLUENCE_E2E_BASE_URL;
		const parentId = environment.CONFLUENCE_E2E_PARENT_ID;
		const authorization = `Basic ${Buffer.from(`${environment.ATLASSIAN_USERNAME}:${environment.ATLASSIAN_API_TOKEN}`).toString("base64")}`;
		const get = (suffix) =>
			Effect.tryPromise(async () => {
				const response = await fetch(`${baseUrl}/wiki/rest/api/${suffix}`, {
					headers: { Authorization: authorization, Accept: "application/json" },
					redirect: "error",
					signal: AbortSignal.timeout(30000),
				});
				if (!response.ok)
					throw new Error(
						`Confluence verification request failed: HTTP ${response.status}`,
					);
				return response.json();
			});
		const parent = yield* get(`content/${parentId}?expand=space`);
		assert.equal(
			parent.space?.key,
			environment.CONFLUENCE_E2E_SPACE_KEY,
			"Refusing to publish outside the dedicated space",
		);
		const evaluate = (body) =>
			Effect.gen(function* () {
				// The prefix checks the vault path on every operation, including read-only probes.
				const code = `(async () => { if(app.vault.adapter.getBasePath() !== ${JSON.stringify(vaultPath)}) throw Error('Wrong test vault'); ${body} })()`;
				const output = yield* desktopCommand([
					`vault=${path.basename(vaultPath)}`,
					"eval",
					`code=${code}`,
				]);
				return parseObsidianOutput(output);
			});
		// Validate runtime settings as well as the API account used to verify results.
		yield* evaluate("return JSON.stringify({vault:true});");
		yield* desktopCommand([
			`vault=${path.basename(vaultPath)}`,
			"plugin:reload",
			"id=confluence-integration",
		]);
		yield* evaluate(
			`const p=app.plugins.plugins['confluence-integration']; if(!p) throw Error('Enable Confluence Integration in the test vault'); if(p.settings.confluenceBaseUrl !== ${JSON.stringify(baseUrl)} || String(p.settings.confluenceParentId) !== ${JSON.stringify(parentId)}) throw Error('Plugin destination differs from test configuration'); return JSON.stringify({ready:true});`,
		);
		const snapshot = () =>
			Effect.gen(function* () {
				const pages = {};
				for (const filename of publishedNotes) {
					const markdown = yield* fs.readFileString(path.join(vaultPath, filename));
					const pageId = markdown.match(/^connie-page-id:\s*['"]?(\d+)/m)?.[1];
					assert.ok(pageId, `No published ID in ${filename}`);
					assert.ok(
						markdown.includes("connie-page-url:"),
						`No published URL in ${filename}`,
					);
					const page = yield* get(
						`content/${pageId}?expand=space,version,body.atlas_doc_format,ancestors`,
					);
					assert.equal(page.space?.key, environment.CONFLUENCE_E2E_SPACE_KEY);
					const attachments = yield* get(
						`content/${pageId}/child/attachment?limit=250&expand=version`,
					);
					const labels = yield* get(`content/${pageId}/label?limit=250`);
					pages[filename] = {
						id: pageId,
						version: page.version.number,
						body: JSON.parse(page.body.atlas_doc_format.value),
						ancestors: page.ancestors.map((ancestor) => ancestor.id),
						attachments: Object.fromEntries(
							attachments.results.map((attachment) => [
								attachment.title,
								attachment.version.number,
							]),
						),
						labels: labels.results.map((label) => label.name).sort(),
					};
				}
				for (const excluded of [
					"Release Tests/Excluded.md",
					"Release Tests-private/Unselected.md",
					"Source Notes/Reusable.md",
				])
					assert.doesNotMatch(
						yield* fs.readFileString(path.join(vaultPath, excluded)),
						/^connie-page-id:/m,
					);
				const media = pages["Release Tests/Media.md"];
				assert.ok(
					Object.keys(media.attachments).some((title) =>
						title.startsWith("RenderedMermaidChart-"),
					),
				);
				assert.ok(
					Object.keys(media.attachments).some((title) =>
						title.startsWith("RenderedPlantumlChart-"),
					),
				);
				assert.ok(Object.keys(media.attachments).length >= 5);
				assert.ok(pages["Tagged/Tag selection.md"].labels.includes("release-test"));
				assert.equal(
					pages["Release Tests/Hierarchy/Child.md"].ancestors.at(-1),
					pages["Release Tests/Hierarchy/README.md"].id,
				);
				return pages;
			});
		const publish = () =>
			evaluate(
				`const result=await app.plugins.plugins['confluence-integration'].doPublish(); if(result.errorMessage || result.failedFiles.length || result.filesUploadResult.length < 7) throw Error('Desktop publish failed'); return JSON.stringify({count:result.filesUploadResult.length});`,
			);
		yield* publish();
		const first = yield* snapshot();
		yield* publish();
		assert.deepEqual(
			yield* snapshot(),
			first,
			"Desktop republishing changed unchanged pages or attachments",
		);
		const filename = "Release Tests/Formatting.md";
		const sentinel = `DESKTOP INTEGRATION UPDATE ${Date.now()}`;
		const original = yield* fs.readFileString(path.join(vaultPath, filename));
		// Use Obsidian's vault API so metadata caches and file events participate.
		yield* evaluate(
			`const file=app.vault.getAbstractFileByPath(${JSON.stringify(filename)}); await app.vault.modify(file, (await app.vault.read(file)) + ${JSON.stringify(`\n\n${sentinel}\n`)}); return JSON.stringify({modified:true});`,
		);
		let updated;
		yield* Effect.gen(function* () {
			yield* publish();
			updated = yield* snapshot();
			for (const [note, page] of Object.entries(updated)) {
				if (note === filename) {
					assert.equal(page.version, first[note].version + 1);
					assert.ok(JSON.stringify(page.body).includes(sentinel));
					assert.deepEqual(page.attachments, first[note].attachments);
				} else assert.deepEqual(page, first[note], `Updating one note changed ${note}`);
			}
		}).pipe(
			Effect.ensuring(
				evaluate(
					`const file=app.vault.getAbstractFileByPath(${JSON.stringify(filename)}); await app.vault.modify(file, ${JSON.stringify(original)}); return JSON.stringify({restored:true});`,
				),
			),
		);
		// Restore the remote fixture too, so the next run starts from the same note.
		yield* publish();
		if (dataview) {
			const result = yield* runDataviewIntegration({ evaluate, get, prefix: marker.prefix });
			yield* fs.writeFileString(
				path.join(reportDirectory, "dataview.json"),
				JSON.stringify(result, null, 2),
			);
		}

		yield* fs.writeFileString(
			path.join(reportDirectory, "obsidian.json"),
			JSON.stringify(
				{
					status: "passed",
					checks: [
						"desktop-publish",
						"unchanged",
						"single-note-update",
						"electron-mermaid",
						"plantuml",
						"hierarchy",
						"selection",
					],
					pagesAfterUpdate: Object.fromEntries(
						Object.entries(updated).map(([note, page]) => [
							note,
							{ id: page.id, version: page.version },
						]),
					),
				},
				null,
				2,
			),
		);
	});
}
