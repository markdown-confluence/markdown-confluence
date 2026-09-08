import assert from "node:assert/strict";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import {
	runEffect,
	RuntimeEnvironmentService,
	Publisher,
	DEFAULT_KROKI_SETTINGS,
	ConfluenceUploadSettings,
	createAuthenticatedConfluenceClient,
	KrokiRendererPlugin,
	HttpKrokiRenderer,
} from "../packages/lib/dist/index.js";
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
		const environment = {};
		for (const key of [
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
			environment[key] = yield* runtime.getEnv(key);
		const directory = yield* fs.makeTempDirectory({ prefix: "confluence-kroki-" });
		const connection = liveConnectionSettings(environment);
		const client = yield* createAuthenticatedConfluenceClient(connection);
		const commenter = yield* createInlineCommentClient(client, connection);
		const note = path.join(directory, "kroki.md");
		const source = `---\nconnie-title: Kroki integration ${Date.now()}\n---\n\n${inlineCommentSelection}\n\n\`\`\`kroki-graphviz\ndigraph G { Hello -> World }\n\`\`\`\n\n\`\`\`kroki-ditaa\n+-------+   +-------+\n| Hello |-->| World |\n+-------+   +-------+\n\`\`\`\n`;
		yield* fs.writeFileString(note, source);
		yield* Effect.tryPromise(async () => {
			const parent = await client.content.getContentById({
				id: connection.confluenceParentId,
				expand: ["space"],
			});
			assert.equal(parent.space.key, environment.CONFLUENCE_E2E_SPACE_KEY);
			const settings = {
				...ConfluenceUploadSettings.DEFAULT_SETTINGS,
				...connection,
				contentRoot: directory,
				folderToPublish: ".",
			};
			const publisher = (format) =>
				new Publisher(settings, client, [
					new KrokiRendererPlugin(
						new HttpKrokiRenderer({
							...DEFAULT_KROKI_SETTINGS,
							serverUrl: "https://kroki.io",
							format,
						}),
					),
				]);
			const publish = async (format) => {
				const results = await publisher(format).publish();
				assert.equal(results.length, 1);
				assert.ok(results[0].successfulUploadResult, results[0].reason);
				return results[0];
			};
			const first = await publish("png");
			const pageId = first.node.file.pageId;
			const read = () =>
				client.content.getContentById({
					id: pageId,
					expand: ["body.atlas_doc_format", "version"],
				});
			const before = await read();
			const body = JSON.parse(before.body.atlas_doc_format.value);
			assert.equal(body.content.filter((node) => node.type === "mediaSingle").length, 2);
			const comment = await createInlineCommentFixture(commenter, pageId);
			await Effect.runPromise(
				fs.writeFileString(
					note,
					(await Effect.runPromise(fs.readFileString(note))) +
						"\nAn edit outside the comment.\n",
				),
			);
			await publish("png");
			await verifyInlineComment(commenter, comment);
			const edited = await read();
			await publish("png");
			assert.equal((await read()).version.number, edited.version.number);
			await publish("svg");
			const svg = await read();
			assert.equal(
				JSON.parse(svg.body.atlas_doc_format.value).content.filter(
					(node) => node.type === "mediaSingle",
				).length,
				2,
			);
			await verifyInlineComment(commenter, comment);
			await publish("svg");
			assert.equal((await read()).version.number, svg.version.number);
			await Effect.runPromise(
				fs.writeFileString(
					note,
					(await Effect.runPromise(fs.readFileString(note))).replace(
						"Hello -> World",
						"Hello -> Changed",
					),
				),
			);
			await publish("svg");
			assert.ok((await read()).version.number > svg.version.number);
			await verifyInlineComment(commenter, comment);
			const evidence = {
				status: "passed",
				authType: connection.confluenceAuthType,
				pageId,
				checks: [
					"Graphviz and Ditaa",
					"PNG and SVG",
					"create/update/no-op",
					"inline comment preservation",
					"source changes",
				],
			};
			await Effect.runPromise(
				fs.writeFileString(
					path.join(environment.CONFLUENCE_E2E_REPORT_DIRECTORY, "kroki.json"),
					JSON.stringify(evidence, null, 2),
				),
			);
			console.log(JSON.stringify(evidence));
		});
	}),
);
