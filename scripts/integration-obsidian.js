import assert from "node:assert/strict";
import {
	createInlineCommentClient,
	createInlineCommentFixture,
	verifyInlineComment,
	inlineCommentSelection,
} from "./integration-comments.js";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { RuntimeEnvironmentService } from "../packages/lib/src/effects/index.ts";
import { liveConnectionSettings } from "./integration-options.js";
import { vaultMarker } from "./integration-vault.js";
import { runDataviewIntegration } from "./integration-dataview.js";
import { runOAuthUiIntegration, runDeviceAvailabilityIntegration } from "./integration-oauth-ui.js";

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
		const {
			createAuthenticatedConfluenceClient,
			ConfluenceUploadSettings,
			normalizeAdfForComparison,
		} = yield* Effect.tryPromise(() => import("../packages/lib/dist/index.js"));
		const parentId = environment.CONFLUENCE_E2E_PARENT_ID;
		const connection = liveConnectionSettings(environment);
		const client = yield* createAuthenticatedConfluenceClient({
			...ConfluenceUploadSettings.DEFAULT_SETTINGS,
			...connection,
		});
		const commenter = yield* createInlineCommentClient(client, connection);

		const get = (suffix) =>
			Effect.tryPromise(() => {
				const url = new URL(suffix, "https://verification.invalid/");
				const id = url.pathname.split("/")[2];
				if (url.pathname.endsWith("/child/attachment"))
					return client.contentAttachments.getAttachments({
						id,
						limit: 250,
						expand: ["version"],
					});
				if (url.pathname.endsWith("/label"))
					return client.contentLabels.getLabelsForContent({ id, limit: 250 });
				return client.content.getContentById({
					id,
					expand: (url.searchParams.get("expand") || "").split(","),
				});
			});
		const parent = yield* get(`content/${parentId}?expand=space`);
		assert.equal(
			parent.space?.key,
			environment.CONFLUENCE_E2E_SPACE_KEY,
			"Refusing to publish outside the dedicated space",
		);
		const evaluate = (body, waitForRuntime = false) =>
			Effect.gen(function* () {
				// CLI eval does not await promises in every Obsidian version. Start once,
				// then poll a synchronous result; never retry a publishing mutation.
				const id = randomUUID();
				const guard = `if(app.vault.adapter.getBasePath() !== ${JSON.stringify(vaultPath)}) throw Error('Wrong test vault');`;
				const run = (code) =>
					desktopCommand([`vault=${path.basename(vaultPath)}`, "eval", `code=${code}`]);
				if (waitForRuntime) {
					for (let attempt = 0; attempt < 20; attempt++) {
						const output = yield* run(
							`(()=>{${guard} return JSON.stringify({ready:true});})()`,
						);
						if (output.includes("=> ")) break;
						yield* Effect.sleep("250 millis");
					}
				}
				const key = JSON.stringify(id);
				yield* run(
					`(()=>{${guard} const jobs=app.__confluenceIntegrationJobs??={}; jobs[${key}]={status:'running'}; Promise.resolve().then(async()=>{${body}}).then(value=>jobs[${key}]={status:'done',value},error=>{let message=String(error?.message??error); const settings=app.plugins.plugins['confluence-integration']?.settings??{}; for(const field of ['atlassianApiToken','atlassianClientSecret']) if(settings[field]) message=message.split(settings[field]).join('[redacted]'); jobs[${key}]={status:'error',message};}); return JSON.stringify({started:true});})()`,
				);
				return yield* Effect.gen(function* () {
					for (let attempt = 0; attempt < 360; attempt++) {
						const output = yield* run(
							`(()=>{${guard} return JSON.stringify(app.__confluenceIntegrationJobs?.[${key}]??{status:'missing'});})()`,
						);
						if (output.includes("=> ")) {
							const job = parseObsidianOutput(output);
							if (job.status === "done") return JSON.parse(job.value);
							if (job.status === "error") throw new Error(job.message);
							if (job.status === "missing")
								throw new Error("Obsidian did not start the integration operation");
						}
						yield* Effect.sleep("500 millis");
					}
					throw new Error("Obsidian integration operation timed out after three minutes");
				}).pipe(
					Effect.ensuring(
						run(
							`(()=>{${guard} delete app.__confluenceIntegrationJobs?.[${key}]; return JSON.stringify({cleaned:true});})()`,
						),
					),
				);
			});
		// Validate runtime settings as well as the API account used to verify results.
		yield* evaluate("return JSON.stringify({vault:true});", true);
		// A hidden Electron renderer can throttle timers to once a minute. Keep
		// automated UI/index waits responsive, then restore the user's setting.
		yield* Effect.acquireRelease(
			evaluate(`
				const contents=require('@electron/remote').getCurrentWindow().webContents;
				const previous=contents.getBackgroundThrottling();
				contents.setBackgroundThrottling(false);
				return JSON.stringify(previous);
			`),
			(previous) =>
				evaluate(`
					require('@electron/remote').getCurrentWindow().webContents.setBackgroundThrottling(${previous});
					return JSON.stringify({restored:true});
				`).pipe(Effect.orDie),
		);
		yield* desktopCommand([
			`vault=${path.basename(vaultPath)}`,
			"plugin:reload",
			"id=confluence-integration",
		]);
		const runtimeAuthentication = yield* evaluate(
			`const p=app.plugins.plugins['confluence-integration']; if(!p) throw Error('Enable Confluence Integration in the test vault'); if(p.settings.confluenceBaseUrl !== ${JSON.stringify(connection.confluenceBaseUrl)} || p.settings.confluenceAuthType !== ${JSON.stringify(connection.confluenceAuthType)} || String(p.settings.confluenceParentId) !== ${JSON.stringify(parentId)}) throw Error('Plugin destination differs from test configuration'); return JSON.stringify({ready:true,mode:p.settings.oauthMode || "basic",flow:p.settings.oauthFlow});`,
			true,
		);
		const oauthUi =
			runtimeAuthentication.mode === "browser"
				? yield* runOAuthUiIntegration({ evaluate })
				: undefined;
		const deviceAvailability =
			runtimeAuthentication.mode === "browser"
				? yield* runDeviceAvailabilityIntegration({ evaluate })
				: undefined;
		let browserRefresh;
		if (runtimeAuthentication.mode === "browser") {
			browserRefresh = yield* evaluate(
				`const p=app.plugins.plugins['confluence-integration']; const secretId=p.settings.oauthSecretId; const stored=app.secretStorage?.getSecret(secretId); if(!stored) throw Error('Connect to Atlassian in the test vault first'); const before=JSON.parse(stored); app.secretStorage.setSecret(secretId,JSON.stringify({...before,expiresAt:0})); await p.browserOAuth.accessToken(); const after=JSON.parse(app.secretStorage.getSecret(secretId)); if(before.refreshToken===after.refreshToken || after.expiresAt<=Date.now()+120000) throw Error('Browser OAuth did not rotate the expired token'); const serialized=JSON.stringify(p.settings); if(serialized.includes(after.accessToken)||serialized.includes(after.refreshToken)) throw Error('Browser tokens leaked into plugin settings'); return JSON.stringify({rotated:true,secretStorage:true});`,
			);
			yield* fs.writeFileString(
				path.join(reportDirectory, "oauth.json"),
				JSON.stringify({ oauthUi, deviceAvailability, browserRefresh }, null, 2),
			);
			yield* Effect.log("OAuth: UI checks and real token refresh passed");
		}

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
						body: normalizeAdfForComparison(
							JSON.parse(page.body.atlas_doc_format.value),
						),
						ancestors: page.ancestors.map((ancestor) => ancestor.id),
						mp4AttachmentCount: attachments.results.filter((attachment) =>
							attachment.title.endsWith("-sample.mp4"),
						).length,
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
				assert.equal(
					media.mp4AttachmentCount,
					1,
					"Desktop MP4 embeds must share one uploaded attachment",
				);
				assert.ok(JSON.stringify(media.body).includes("After the MP4 embeds."));
				assert.ok(pages["Tagged/Tag selection.md"].labels.includes("release-test"));
				assert.equal(
					pages["Release Tests/Hierarchy/Child.md"].ancestors.at(-1),
					pages["Release Tests/Hierarchy/README.md"].id,
				);
				return pages;
			});
		const publish = () =>
			evaluate(
				`const result=await app.plugins.plugins['confluence-integration'].doPublish(); if(result.errorMessage || result.failedFiles.length || result.filesUploadResult.length < 7) throw Error('Desktop publish failed: '+JSON.stringify({message:result.errorMessage,failed:result.failedFiles,count:result.filesUploadResult.length})); return JSON.stringify({count:result.filesUploadResult.length});`,
			);
		yield* evaluate(
			`const file=app.vault.getAbstractFileByPath('Release Tests/Formatting.md'); const text=await app.vault.read(file); if(!text.includes(${JSON.stringify(inlineCommentSelection)})) await app.vault.modify(file,text+${JSON.stringify("\n\n" + inlineCommentSelection + "\n")}); return JSON.stringify({fixtureReady:true});`,
		);

		const mathFixture =
			"\n\n## LaTeX integration\n\nInline energy $E=mc^2$ stays in this sentence.\n\n$$\\frac{1}{2}$$\n";
		yield* evaluate(
			`const file=app.vault.getAbstractFileByPath('Release Tests/Formatting.md'); const text=await app.vault.read(file); if(!text.includes('Inline energy $E=mc^2$')) await app.vault.modify(file,text+${JSON.stringify(mathFixture)}); return JSON.stringify({mathFixtureReady:true});`,
		);
		yield* publish();
		let first = yield* snapshot();
		assert.ok(
			JSON.stringify(first["Release Tests/Formatting.md"].body).includes(
				'"type":"mediaInline"',
			),
			"Desktop math must remain inline",
		);
		assert.ok(
			Object.keys(first["Release Tests/Formatting.md"].attachments).some((name) =>
				name.startsWith("RenderedMath-"),
			),
			"Desktop math PNG attachments must exist",
		);
		yield* publish();
		assert.deepEqual(
			yield* snapshot(),
			first,
			"Desktop republishing changed unchanged pages or attachments",
		);
		const inlineComment = yield* Effect.tryPromise(() =>
			createInlineCommentFixture(commenter, first["Release Tests/Formatting.md"].id),
		);
		first = yield* snapshot();

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
		const inlineCommentEvidence = yield* Effect.tryPromise(() =>
			verifyInlineComment(commenter, inlineComment),
		);
		const restored = yield* snapshot();
		yield* publish();
		assert.deepEqual(
			yield* snapshot(),
			restored,
			"A page with an inline comment must remain unchanged on republish",
		);

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
					inlineComment: inlineCommentEvidence,
					authentication: connection.confluenceAuthType,
					oauthMode: runtimeAuthentication.mode,
					oauthFlow: runtimeAuthentication.flow,
					oauthUi,
					deviceAvailability,
					browserRefresh,
					checks: [
						"desktop-publish",
						"unchanged",
						"single-note-update",
						"inline-comments-preserved",
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
	}).pipe(Effect.scoped);
}
