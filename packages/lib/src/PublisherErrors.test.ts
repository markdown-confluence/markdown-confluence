import { expect, test, vi } from "@effect/vitest";
import { Effect } from "effect";
import { runEffect } from "./effects";
import { MarkdownFile, MarkdownWorkspace, MarkdownWorkspaceService } from "./MarkdownWorkspace";
import { validatePublishingFiles } from "./PublishingReport";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { Publisher } from "./Publisher";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";

test("explains how to resolve a missing parent page space key", async () => {
	const publisher = new Publisher(testSettings, createConfluenceClientWithoutParentSpace(), []);

	await expect(publisher.publish()).rejects.toThrow(
		/Missing Space Key for Confluence page "123456"\. .*there is no separate space-key setting.*set confluenceBaseUrl to the Atlassian site URL without \/wiki/,
	);
});

function createConfluenceClientWithoutParentSpace(): RequiredConfluenceClient {
	return {
		users: {
			getCurrentUser: async () => ({ accountId: "current-user" }),
		},
		content: {
			getContentById: async () => ({
				id: testSettings.confluenceParentId,
			}),
		},
		contentAttachments: {},
		contentLabels: {},
		space: {},
	} as unknown as RequiredConfluenceClient;
}

const testSettings: ConfluenceSettings = {
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceSiteUrl: "",
	confluenceParentId: "123456",
	confluenceAuthType: "basic",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	atlassianClientId: "",
	atlassianClientSecret: "",
	folderToPublish: ".",
	tagsToPublish: "",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
};

test.each([
	{ first: "/docs/one.md", second: "/docs/two.md", sameTitle: false },
	{ first: "/docs/one.md", second: "/docs/two.md", sameTitle: true },
	{ first: "/docs/one.md", second: "/docs/nested/two.md", sameTitle: false },
])(
	"rejects duplicate explicit page IDs before any writes: $second, same title $sameTitle",
	async ({ first, second, sameTitle }) => {
		const frontmatter = {
			"connie-page-id": "2",
			...(sameTitle ? { "connie-title": "Same Title" } : {}),
		};
		const files = [publishingFile(first, frontmatter), publishingFile(second, frontmatter)];
		const validation = validatePublishingFiles(files, testSettings);
		expect(validation.valid).toBe(false);
		expect(validation.errors.join(" ")).toContain(first);
		expect(validation.errors.join(" ")).toContain(second);
		const fixture = publishingFixture(files);
		await expect(fixture.publish()).rejects.toThrow('Confluence page ID "2"');
		expect(fixture.createContent).not.toHaveBeenCalled();
		expect(fixture.updateContent).not.toHaveBeenCalled();
		expect(fixture.sendRequest).not.toHaveBeenCalled();
		expect(fixture.metadata).not.toHaveBeenCalled();
	},
);

test("rejects a title-resolved duplicate before creating an earlier missing page", async () => {
	const fixture = publishingFixture([
		publishingFile("/docs/new.md"),
		publishingFile("/docs/renamed.md", { "connie-page-id": "2" }),
		publishingFile("/docs/original.md"),
	]);
	fixture.getContent.mockImplementation(async ({ title }) => ({
		results: title === "original" ? [remotePage("2", "original")] : [],
	}));
	await expect(fixture.publish()).rejects.toThrow(/page ID "2".*renamed.md.*original.md/);
	expect(fixture.createContent).not.toHaveBeenCalled();
	expect(fixture.updateContent).not.toHaveBeenCalled();
	expect(fixture.sendRequest).not.toHaveBeenCalled();
	expect(fixture.metadata).not.toHaveBeenCalled();
});

test.each(["README", "index", "docs"])(
	"rejects a child targeting the configured parent of the %s root note",
	async (rootName) => {
		const fixture = publishingFixture([
			publishingFile(`/docs/${rootName}.md`),
			publishingFile("/docs/child.md", { "connie-page-id": testSettings.confluenceParentId }),
		]);
		await expect(fixture.publish()).rejects.toThrow(
			`Confluence page ID "${testSettings.confluenceParentId}"`,
		);
		expect(fixture.createContent).not.toHaveBeenCalled();
		expect(fixture.updateContent).not.toHaveBeenCalled();
		expect(fixture.sendRequest).not.toHaveBeenCalled();
		expect(fixture.metadata).not.toHaveBeenCalled();
	},
);

test("rejects a stale ID recovering to another note's target without changing either note", async () => {
	const fixture = publishingFixture([
		publishingFile("/docs/one.md", { "connie-page-id": "2" }),
		publishingFile("/docs/two.md", { "connie-page-id": "stale" }),
	]);
	fixture.getContentById.mockImplementation(async ({ id }) => {
		if (id === "stale")
			throw Object.assign(new Error("Not found"), { response: { status: 404 } });
		return remotePage(id);
	});
	fixture.getContent.mockResolvedValue({ results: [remotePage("2", "two")] });
	await expect(fixture.publish()).rejects.toThrow('Confluence page ID "2"');
	expect(fixture.createContent).not.toHaveBeenCalled();
	expect(fixture.updateContent).not.toHaveBeenCalled();
	expect(fixture.sendRequest).not.toHaveBeenCalled();
	expect(fixture.metadata).not.toHaveBeenCalled();
});

test("validates newly created target IDs before metadata, attachments, or content writes", async () => {
	const fixture = publishingFixture([
		publishingFile("/docs/new.md"),
		publishingFile("/docs/existing.md", { "connie-page-id": "2" }),
	]);
	fixture.createContent.mockResolvedValue(remotePage("2", "new"));
	await expect(fixture.publish()).rejects.toThrow('Confluence page ID "2"');
	expect(fixture.createContent).toHaveBeenCalledTimes(1);
	expect(fixture.updateContent).not.toHaveBeenCalled();
	expect(fixture.sendRequest).not.toHaveBeenCalled();
	expect(fixture.metadata).not.toHaveBeenCalled();
});

test.each(["lookup", "create"])(
	"preserves stale metadata and publication intent when replacement %s fails",
	async (failureStage) => {
		const files = [
			publishingFile("/docs/one.md", {
				"connie-publish": true,
				"connie-page-id": "stale",
				"connie-page-url": "https://example.atlassian.net/wiki/spaces/SPACE/pages/stale/",
			}),
		];
		const originalFiles = structuredClone(files);
		const fixture = publishingFixture(files);
		fixture.getContentById.mockImplementation(async ({ id }) => {
			if (id === "stale")
				throw Object.assign(new Error("Not found"), { response: { status: 404 } });
			return remotePage(id);
		});
		if (failureStage === "lookup")
			fixture.getContent.mockRejectedValue(new Error("Lookup failed"));
		else fixture.createContent.mockRejectedValue(new Error("Create failed"));
		await expect(fixture.publish()).rejects.toThrow(/failed/);
		expect(fixture.metadata).not.toHaveBeenCalled();
		expect(files).toEqual(originalFiles);
		// A second attempt still receives the original opt-in and target, with only a final update.
		fixture.getContent.mockResolvedValue({ results: [remotePage("3", "one")] });
		const results = await fixture.publish();
		expect(results[0]?.successfulUploadResult).toBeDefined();
		expect(fixture.metadata).toHaveBeenCalledExactlyOnceWith("/docs/one.md", {
			publish: true,
			pageId: "3",
			pageUrl: "https://example.atlassian.net/wiki/spaces/SPACE/pages/3/",
		});
	},
);

test("a metadata write failure does not trigger stale-ID recovery or clear publication intent", async () => {
	const fixture = publishingFixture([
		publishingFile("/docs/one.md", { "connie-page-id": "2", "connie-publish": true }),
	]);
	fixture.metadata.mockImplementation(() => {
		throw Object.assign(new Error("Metadata unavailable"), { response: { status: 404 } });
	});
	await expect(fixture.publish()).rejects.toThrow("Metadata unavailable");
	expect(fixture.getContent).not.toHaveBeenCalled();
	expect(fixture.createContent).not.toHaveBeenCalled();
	expect(fixture.metadata).toHaveBeenCalledTimes(1);
	expect(fixture.metadata.mock.calls[0]?.[1]).toMatchObject({ publish: true, pageId: "2" });
});

function publishingFile(source: string, frontmatter: Record<string, unknown> = {}): MarkdownFile {
	const fileName = source.split("/").at(-1)!;
	return {
		folderName: "docs",
		absoluteFilePath: source,
		fileName,
		contents: `Body of ${source}`,
		pageTitle: fileName.replace(/\.md$/, ""),
		frontmatter: { ...frontmatter },
	};
}

function remotePage(id: string, title = "Remote page") {
	return {
		id,
		title,
		type: "page",
		space: { key: "SPACE" },
		version: { number: 1, by: { accountId: "current-user" } },
		body: {
			atlas_doc_format: { value: JSON.stringify({ type: "doc", version: 1, content: [] }) },
		},
		ancestors: [{ id: testSettings.confluenceParentId }],
	};
}

function publishingFixture(files: MarkdownFile[]) {
	const metadata = vi.fn((_source: string, _values: unknown) => {});
	const workspace: MarkdownWorkspace = {
		getMarkdownFilesToUpload: Effect.succeed(files),
		updateMarkdownValues: (source, values) =>
			Effect.try({ try: () => metadata(source, values), catch: (error) => error as Error }),
		loadMarkdownFile: () => Effect.fail(new Error("Unused")),
		readBinary: () => Effect.succeed(false),
		readText: () => Effect.succeed(false),
	};
	const getContentById = vi.fn(async ({ id }: { id: string }) => remotePage(id));
	const getContent = vi.fn(async (_request: { title?: string }) => ({
		results: [] as ReturnType<typeof remotePage>[],
	}));
	const createContent = vi.fn(async ({ title }: { title: string }) => remotePage("new", title));
	// Keep optimistic concurrency realistic: duplicate detection must run before retries can overwrite.
	let version = 1;
	const updateContent = vi.fn(async (request: { id: string; version: { number: number } }) => {
		if (request.version.number !== version + 1)
			throw Object.assign(new Error("Version conflict"), { response: { status: 409 } });
		version++;
		return remotePage(request.id);
	});
	const sendRequest = vi.fn(async () => {
		throw new Error("Unexpected attachment write");
	});
	const client = {
		users: { getCurrentUser: async () => ({ accountId: "current-user" }) },
		content: { getContentById, getContent, createContent, updateContent },
		contentAttachments: { getAttachments: async () => ({ results: [] }) },
		contentLabels: { getLabelsForContent: async () => ({ results: [] }) },
		sendRequest,
	} as unknown as RequiredConfluenceClient;
	return {
		metadata,
		getContentById,
		getContent,
		createContent,
		updateContent,
		sendRequest,
		publish: () =>
			runEffect(
				new Publisher(testSettings, client, [])
					.publishEffect()
					.pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
			),
	};
}
