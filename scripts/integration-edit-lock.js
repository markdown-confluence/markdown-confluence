import {
	RuntimeEnvironmentService,
	MarkdownConfluencePlatformLive,
} from "../packages/lib/dist/index.js";
import { NodeServices } from "@effect/platform-node";
import assert from "node:assert/strict";
import { Effect } from "effect";
import {
	createAuthenticatedConfluenceClient,
	lockPageEditing,
} from "../packages/lib/dist/index.js";
import { liveConnectionSettings } from "./integration-options.js";

// Uses the same dedicated-site guard and credentials as the existing live suite.
const environment = await Effect.runPromise(
	Effect.gen(function* () {
		const runtime = yield* RuntimeEnvironmentService;
		const values = {};
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
		])
			values[name] = yield* runtime.getEnv(name);
		return values;
	}).pipe(Effect.provide(NodeServices.layer), Effect.provide(MarkdownConfluencePlatformLive)),
);
const settings = liveConnectionSettings(environment);
const client = await Effect.runPromise(createAuthenticatedConfluenceClient(settings));
const account = await client.users.getCurrentUser();
const page = await client.content.createContent({
	type: "page",
	title: `Edit lock integration ${Date.now()}`,
	space: { key: environment.CONFLUENCE_E2E_SPACE_KEY },
	ancestors: [{ id: settings.confluenceParentId }],
	body: {
		atlas_doc_format: {
			representation: "atlas_doc_format",
			value: JSON.stringify({
				type: "doc",
				version: 1,
				content: [
					{
						type: "paragraph",
						content: [{ type: "text", text: "Edit lock integration fixture" }],
					},
				],
			}),
		},
	},
});
const path = `/wiki/rest/api/content/${page.id}/restriction/byOperation/read`;
await client.sendRequest({
	url: `${path}/user`,
	method: "PUT",
	searchParams: { accountId: account.accountId },
});
const before = await client.sendRequest({
	url: path,
	searchParams: { expand: "restrictions.user,restrictions.group" },
});
assert.equal(await lockPageEditing(client, page.id, account.accountId), "updated");
assert.equal(await lockPageEditing(client, page.id, account.accountId), "same");
const after = await client.sendRequest({
	url: path,
	searchParams: { expand: "restrictions.user,restrictions.group" },
});
assert.deepEqual(after.restrictions, before.restrictions);
const current = await client.content.getContentById({ id: page.id, expand: ["version"] });
await client.content.updateContent({
	id: page.id,
	type: "page",
	title: page.title,
	version: { number: current.version.number + 1 },
	body: {
		atlas_doc_format: {
			representation: "atlas_doc_format",
			value: JSON.stringify({
				type: "doc",
				version: 1,
				content: [
					{
						type: "paragraph",
						content: [{ type: "text", text: "Publisher updated the locked page" }],
					},
				],
			}),
		},
	},
});
console.log(
	JSON.stringify({
		pageId: page.id,
		authType: settings.confluenceAuthType,
		locked: true,
		repeat: "same",
		readRestrictionsPreserved: true,
		publisherUpdate: true,
	}),
);
