import assert from "node:assert/strict";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";

/** Seed comments as a collaborator without expanding the publisher's permissions. */
export function createInlineCommentClient(publisher, connection) {
	return Effect.gen(function* () {
		const {
			ConfluenceUploadSettings,
			RuntimeEnvironmentService,
			createAuthenticatedConfluenceClient,
		} = yield* Effect.promise(() => import("../packages/lib/dist/index.js"));
		const fs = yield* FileSystem;
		const runtime = yield* RuntimeEnvironmentService;
		const settingsFile = yield* runtime.getEnv("CONFLUENCE_E2E_COMMENTS_SETTINGS_FILE");
		const token = yield* runtime.getEnv("CONFLUENCE_E2E_COMMENTS_API_TOKEN");
		const username = yield* runtime.getEnv("CONFLUENCE_E2E_COMMENTS_USERNAME");
		const siteUrl = connection.confluenceSiteUrl || connection.confluenceBaseUrl;
		if (!settingsFile && !token && !username) return publisher;
		if (!settingsFile)
			assert.ok(
				token && username,
				"Comment fixture credentials need both username and API token",
			);
		const settings = settingsFile
			? JSON.parse(yield* fs.readFileString(settingsFile))
			: {
					confluenceAuthType: "basic",
					confluenceBaseUrl:
						(yield* runtime.getEnv("CONFLUENCE_E2E_COMMENTS_API_URL")) || siteUrl,
					confluenceSiteUrl: siteUrl,
					atlassianUserName: username,
					atlassianApiToken: token,
				};
		assert.equal(
			settings.confluenceSiteUrl || settings.confluenceBaseUrl,
			siteUrl,
			"Comment fixture credentials must target the dedicated test site",
		);
		return yield* createAuthenticatedConfluenceClient({
			...ConfluenceUploadSettings.DEFAULT_SETTINGS,
			...settings,
		});
	});
}

export const inlineCommentSelection = "Inline comment anchor stays here.";
const commentText =
	"Integration test: keep this comment attached when another part of the page changes.";

/** The fixture account may create comments; the publishing account only needs page access. */
export async function createInlineCommentFixture(client, pageId) {
	const comment = await client.sendRequest({
		url: "/wiki/api/v2/inline-comments",
		method: "POST",
		body: {
			pageId,
			body: { representation: "storage", value: `<p>${commentText}</p>` },
			inlineCommentProperties: {
				textSelection: inlineCommentSelection,
				textSelectionMatchCount: 1,
				textSelectionMatchIndex: 0,
			},
		},
	});
	assert.ok(comment.id, "Confluence must create a real inline comment");
	const fixture = { pageId, commentId: comment.id };
	await verifyInlineComment(client, fixture);
	return fixture;
}

export async function verifyInlineComment(client, fixture) {
	const comment = await client.sendRequest({
		url: `/wiki/api/v2/inline-comments/${fixture.commentId}`,
		searchParams: { "body-format": "storage", "include-properties": true },
	});
	assert.equal(comment.pageId, fixture.pageId, "Comment must remain on its original page");
	assert.equal(comment.status, "current", "Comment must remain active");
	assert.equal(comment.resolutionStatus, "open", "Comment must remain unresolved");
	assert.ok(comment.body.storage.value.includes(commentText), "Comment body must survive");
	const marker = comment.properties.inlineMarkerRef;
	assert.ok(marker, "Comment must keep its inline anchor");
	if (fixture.marker) assert.equal(marker, fixture.marker, "Comment marker must not change");
	fixture.marker = marker;
	const page = await client.content.getContentById({ id: fixture.pageId });
	const adf = JSON.parse(page.body.atlas_doc_format.value);
	const anchored = [];
	const visit = (node) => {
		if (
			node.marks?.some(
				(mark) =>
					mark.type === "annotation" &&
					mark.attrs?.annotationType === "inlineComment" &&
					mark.attrs.id === marker,
			)
		)
			anchored.push(node.text ?? "");
		for (const child of node.content ?? []) visit(child);
	};
	visit(adf);
	assert.equal(
		anchored.join(""),
		inlineCommentSelection,
		"Comment must highlight the original text after publishing",
	);
	assert.ok(
		!JSON.stringify(adf).includes("Inline comments that couldn't be mapped"),
		"The existing anchor must survive without an unmapped-comment fallback",
	);
	return {
		commentId: comment.id,
		marker,
		pageId: fixture.pageId,
		version: page.version.number,
		status: comment.resolutionStatus,
	};
}
