import assert from "node:assert/strict";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Effect } from "effect";
import {
	Publisher,
	ConfluenceUploadSettings,
	RuntimeEnvironmentService,
	runEffect,
	createAuthenticatedConfluenceClient,
	MermaidRendererPlugin,
	loadMarkdownWorkspace,
	planPublishingFiles,
} from "../packages/lib/dist/index.js";
import { PuppeteerMermaidRenderer } from "../packages/mermaid-puppeteer-renderer/dist/index.js";
import { liveConnectionSettings } from "./integration-options.js";
import {
	createInlineCommentClient,
	createInlineCommentFixture,
	verifyInlineComment,
	inlineCommentSelection,
} from "./integration-comments.js";

await runEffect(
	Effect.gen(function* () {
		const runtime = yield* RuntimeEnvironmentService;
		const fs = yield* FileSystem;
		const path = yield* Path;
		const join = path.join;
		const directory = yield* fs.makeTempDirectory({ prefix: "confluence-fork-ports-" });
		const writeFile = (name, text) => Effect.runPromise(fs.writeFileString(name, text));
		const readFile = (name) => Effect.runPromise(fs.readFileString(name));
		const mkdir = (name) => Effect.runPromise(fs.makeDirectory(name));
		const environment = {};
		for (const name of [
			"ATLASSIAN_USERNAME",
			"ATLASSIAN_API_TOKEN",
			"ATLASSIAN_CLIENT_ID",
			"ATLASSIAN_CLIENT_SECRET",
			"CONFLUENCE_E2E_AUTH_TYPE",
			"CONFLUENCE_E2E_API_URL",
			"CONFLUENCE_E2E_BASE_URL",
			"CONFLUENCE_E2E_PARENT_ID",
			"CONFLUENCE_E2E_SPACE_KEY",
			"CONFLUENCE_E2E_REPORT_DIRECTORY",
		])
			environment[name] = yield* runtime.getEnv(name);
		const connection = liveConnectionSettings(environment);
		const client = yield* createAuthenticatedConfluenceClient(connection);
		const commenter = yield* createInlineCommentClient(client, connection);
		yield* Effect.tryPromise(async () => {
			const parent = await client.content.getContentById({
				id: connection.confluenceParentId,
				expand: ["space"],
			});
			assert.equal(parent.space.key, environment.CONFLUENCE_E2E_SPACE_KEY);

			const diagram =
				"erDiagram\n" +
				Array.from(
					{ length: 12 },
					(_, i) => "ENTITY_" + i + " {\n string label\n int count\n}",
				).join("\n") +
				"\n" +
				Array.from(
					{ length: 11 },
					(_, i) => "ENTITY_" + i + " ||--o{ ENTITY_" + (i + 1) + " : contains",
				).join("\n");
			const rendererEvidence = [];
			for (const options of [
				{ format: "png", scale: 1 },
				{ format: "png", scale: 2 },
				{ format: "svg", scale: 2 },
			]) {
				const renderer = new PuppeteerMermaidRenderer(
					{},
					{ ...options, theme: "base", themeVariables: { primaryColor: "#ddebff" } },
				);
				const bytes = (
					await renderer.captureMermaidCharts([{ name: "large-er", data: diagram }])
				).get("large-er");
				if (options.format === "svg") {
					const svg = bytes.toString();
					assert.ok(
						svg.includes("<svg") &&
							svg.includes("ENTITY_11") &&
							svg.includes("#ddebff"),
					);
					rendererEvidence.push({ format: "svg", text: true, color: true });
				} else
					rendererEvidence.push({
						...options,
						width: bytes.readUInt32BE(16),
						height: bytes.readUInt32BE(20),
					});
			}
			assert.ok(
				rendererEvidence[1].width >= rendererEvidence[0].width * 1.5 &&
					rendererEvidence[1].height >= rendererEvidence[0].height * 1.5,
			);
			await writeFile(
				join(environment.CONFLUENCE_E2E_REPORT_DIRECTORY, "mermaid-options.json"),
				JSON.stringify(rendererEvidence, null, 2),
			);

			await mkdir(join(directory, "private"));
			const title = `Fork ports ${Date.now()}`;
			const note = `---\nconnie-title: ${title}\n---\n\n${inlineCommentSelection}\n\n**Unresolved [[missing-note|formatted link]]**\n\nFootnote[^reference] and again[^reference].\n\n[^reference]: A **named** footnote.\n\n    Another paragraph.\n\n\`\`\`confluence-excerpt summary\nExcerpt **content**.\n\`\`\`\n\n\`\`\`confluence-properties record\n| Key | Value |\n| --- | --- |\n| Flag | false |\n\`\`\`\n\n\`\`\`yaml-table\n- Count: 0\n  Enabled: false\n  Literal: "<"\n\`\`\`\n\nJIRA: DOCS-1\n\n\`\`\`mermaid\nflowchart LR\n A[Before] --> B[After]\n\`\`\`\n`;
			await writeFile(join(directory, "feature.md"), note);
			await writeFile(
				join(directory, "private", "excluded.md"),
				"---\nconnie-publish: true\n---\nExcluded",
			);
			const settings = {
				...ConfluenceUploadSettings.DEFAULT_SETTINGS,
				...connection,
				contentRoot: directory + "/",
				folderToPublish: ".",
				foldersToExclude: ["private"],
				jiraUrl: environment.CONFLUENCE_E2E_BASE_URL,
			};
			const workspace = await loadMarkdownWorkspace(settings);
			const files = await runEffect(workspace.getMarkdownFilesToUpload);
			assert.equal(files.length, 1);
			const before = await readFile(join(directory, "feature.md"), "utf8");
			const plan = await planPublishingFiles(files, settings, client);
			assert.equal(plan.pages[0].action, "create");
			assert.equal(await readFile(join(directory, "feature.md"), "utf8"), before);
			const publish = async (format) => {
				const publisher = new Publisher(settings, client, [
					new MermaidRendererPlugin(
						new PuppeteerMermaidRenderer({}, { format, scale: 2, theme: "neutral" }),
					),
				]);
				let results;
				for (let attempt = 0; attempt < 3; attempt++) {
					results = await publisher.publish();
					if (!results.some((result) => result.reason?.includes("HTTP 404"))) break;
					console.log("Retrying newly created page after a transient 404");
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
				assert.ok(results.length);
				for (const result of results)
					assert.ok(result.successfulUploadResult, result.reason);
				return results[0].successfulUploadResult;
			};
			const first = await publish("png");
			const fixture = await createInlineCommentFixture(commenter, first.adfFile.pageId);
			const saved = await readFile(join(directory, "feature.md"), "utf8");
			await writeFile(
				join(directory, "feature.md"),
				saved + "\nA change elsewhere on the page.\n",
			);
			await publish("png");
			await verifyInlineComment(commenter, fixture);
			const page = await client.content.getContentById({ id: first.adfFile.pageId });
			const contents = JSON.parse(page.body.atlas_doc_format.value);
			const serialized = JSON.stringify(contents);
			for (const expected of [
				'"extensionKey":"excerpt"',
				'"extensionKey":"details"',
				'"extensionKey":"anchor"',
				'"text":"0"',
				'"text":"false"',
				"/browse/DOCS-1",
			])
				assert.ok(serialized.includes(expected), expected);
			const repeat = await publish("png");
			assert.equal(repeat.contentResult, "same", "An unchanged page must not be rewritten");
			await publish("svg");
			await verifyInlineComment(commenter, fixture);

			// Verify real sibling ordering, then cancellation and safe restart.
			settings.orderPages = true;
			const firstPath = join(directory, "rank-a.md");
			const secondPath = join(directory, "rank-b.md");
			await writeFile(firstPath, `---\nconnie-title: ${title} A\nsort-order: 1\n---\nA`);
			await writeFile(secondPath, `---\nconnie-title: ${title} B\nsort-order: 2\n---\nB`);
			const orderedPublisher = new Publisher(settings, client, [
				new MermaidRendererPlugin(new PuppeteerMermaidRenderer()),
			]);
			const initialOrder = await orderedPublisher.publish();
			for (const result of initialOrder)
				assert.ok(result.successfulUploadResult, result.reason);
			const ranked = initialOrder.filter(
				(result) => result.node.file.frontmatter["sort-order"] !== undefined,
			);
			assert.equal(ranked.length, 2);
			await writeFile(
				firstPath,
				(await readFile(firstPath)).replace("sort-order: 1", "sort-order: 3"),
			);
			const reordered = await orderedPublisher.publish();
			for (const result of reordered) assert.ok(result.successfulUploadResult, result.reason);
			const siblings = { results: [] };
			for (let cursor; ; ) {
				const batch = await client.sendRequest({
					method: "GET",
					url: `/wiki/api/v2/pages/${settings.confluenceParentId}/children`,
					searchParams: { ...(cursor ? { cursor } : {}), limit: 100 },
				});
				siblings.results.push(...batch.results);
				if (!batch._links?.next) break;
				assert.ok(batch.results.length);
				const nextCursor = new URL(
					batch._links.next,
					settings.confluenceBaseUrl,
				).searchParams.get("cursor");
				assert.ok(nextCursor && nextCursor !== cursor);
				cursor = nextCursor;
			}
			const orderedIds = siblings.results
				.map((page) => page.id)
				.filter((id) => ranked.some((result) => result.node.file.pageId === id));
			assert.deepEqual(orderedIds, [
				ranked.find((result) => result.node.file.fileName === "rank-b.md").node.file.pageId,
				ranked.find((result) => result.node.file.fileName === "rank-a.md").node.file.pageId,
			]);
			const controller = new AbortController();
			const cancellation = new Publisher(settings, client, [], (message) => {
				if (message.startsWith("Publishing 1/")) controller.abort();
			});
			const cancelled = await cancellation.publish(undefined, { signal: controller.signal });
			assert.ok(
				cancelled.every(
					(result) =>
						!result.successfulUploadResult && result.reason.includes("cancelled"),
				),
			);
			const restarted = await orderedPublisher.publish();
			for (const result of restarted) assert.ok(result.successfulUploadResult, result.reason);
			await verifyInlineComment(commenter, fixture);
			const report = {
				status: "passed",
				authType: settings.confluenceAuthType,
				pageId: first.adfFile.pageId,
				url: first.adfFile.pageUrl,
				commentId: fixture.commentId,
				checks: [
					"exclusions",
					"sibling ordering",
					"cancellation and restart",
					"read-only plan",
					"footnotes",
					"excerpt",
					"properties",
					"YAML values",
					"Jira",
					"PNG scale",
					"SVG",
					"inline comment preservation",
					"unchanged republish",
				],
			};
			await writeFile(
				join(environment.CONFLUENCE_E2E_REPORT_DIRECTORY, "fork-ports.json"),
				JSON.stringify(report, null, 2),
			);
			console.log(JSON.stringify(report));
		});
	}),
);
