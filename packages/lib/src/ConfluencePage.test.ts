import { afterEach, expect, test, vi } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";
import { fetchConfluencePageAdf, resolveConfluencePageId } from "./ConfluencePage";
import * as authentication from "./AuthenticatedConfluenceClient";
import { confluenceReadSettingsConfig } from "./SettingsConfig";
import { DEFAULT_SETTINGS } from "./Settings";
import type { RequiredConfluenceClient } from "./ConfluenceClient";

afterEach(() => vi.restoreAllMocks());

const site = "https://example.atlassian.net";
const readSettings = {
	...DEFAULT_SETTINGS,
	confluenceBaseUrl: site,
	atlassianUserName: "tester@example.com",
	atlassianApiToken: "test-token",
};

test("connection-only configuration requires no publishing parent or folder", async () => {
	const settings = await Effect.runPromise(
		confluenceReadSettingsConfig.parse(
			ConfigProvider.fromUnknown({
				confluenceBaseUrl: site,
				confluenceParentId: "",
				folderToPublish: null,
				atlassianUserName: "tester",
				atlassianApiToken: "test-token",
			}),
		),
	);
	expect(settings).toMatchObject({
		confluenceBaseUrl: site,
		confluenceParentId: "",
		atlassianUserName: "tester",
		atlassianApiToken: "test-token",
	});
});

test("reads ADF through the configured authenticated client without mutating content", async () => {
	const adf = {
		type: "doc",
		version: 1,
		content: [{ type: "paragraph", content: [{ type: "text", text: "Remote page" }] }],
	};
	const getContentById = vi
		.fn()
		.mockResolvedValue({ body: { atlas_doc_format: { value: JSON.stringify(adf) } } });
	vi.spyOn(authentication, "createAuthenticatedConfluenceClient").mockReturnValue(
		Effect.succeed({ content: { getContentById } } as unknown as RequiredConfluenceClient),
	);
	const settings = readSettings;
	expect(
		await Effect.runPromise(
			fetchConfluencePageAdf(settings, `${site}/wiki/spaces/D/pages/123/Title`),
		),
	).toEqual(adf);
	expect(getContentById).toHaveBeenCalledExactlyOnceWith({
		id: "123",
		expand: ["body.atlas_doc_format"],
	});
	expect(authentication.createAuthenticatedConfluenceClient).toHaveBeenCalledExactlyOnceWith(
		settings,
	);
});

test("reports failed reads without exposing transport headers or credentials", async () => {
	vi.spyOn(authentication, "createAuthenticatedConfluenceClient").mockReturnValue(
		Effect.succeed({
			content: {
				getContentById: () =>
					Promise.reject({
						response: { status: 403 },
						config: { headers: { Authorization: "do-not-print" } },
					}),
			},
		} as unknown as RequiredConfluenceClient),
	);
	await expect(
		Effect.runPromise(fetchConfluencePageAdf(readSettings, "123")),
	).rejects.toMatchObject({
		message:
			"Unable to read Confluence page 123 (HTTP 403). Check the configured site, authentication and page permissions.",
	});
});

for (const confluenceAuthType of ["basic", "bearer", "oauth2"] as const) {
	test(`rejects HTTP before creating a ${confluenceAuthType} client or requesting tokens`, async () => {
		const createClient = vi
			.spyOn(authentication, "createAuthenticatedConfluenceClient")
			.mockReturnValue(Effect.die("Client must not be created"));
		await expect(
			Effect.runPromise(
				fetchConfluencePageAdf(
					{
						...readSettings,
						confluenceBaseUrl: "http://example.atlassian.net",
						confluenceAuthType,
						atlassianClientId: "test-client",
						atlassianClientSecret: "test-secret",
					},
					"123",
				),
			),
		).rejects.toThrow(/HTTPS.*base URL/);
		expect(createClient).not.toHaveBeenCalled();
	});
}

test("rejects invalid connection settings before creating an authenticated client", async () => {
	const createClient = vi
		.spyOn(authentication, "createAuthenticatedConfluenceClient")
		.mockReturnValue(Effect.die("Client must not be created"));
	await expect(
		Effect.runPromise(
			fetchConfluencePageAdf(
				{
					...readSettings,
					confluenceBaseUrl: "file:///tmp/confluence",
				},
				"123",
			),
		),
	).rejects.toThrow(/https/i);
	expect(createClient).not.toHaveBeenCalled();
});

test("reads canonical, legacy and overview Confluence page references", () => {
	for (const reference of [
		"123",
		`${site}/wiki/spaces/D/pages/123/Title#heading`,
		`${site}/wiki/pages/viewpage.action?pageId=123`,
		`${site}/wiki/spaces/D/overview?homepageId=123`,
	]) {
		expect(resolveConfluencePageId(reference, site)).toBe("123");
	}
});

test("rejects a different site, credentials in URLs and ambiguous share links", () => {
	for (const reference of [
		"https://elsewhere.example/wiki/spaces/D/pages/123",
		"https://example.atlassian.net.evil.example/wiki/spaces/D/pages/123",
		"https://user:password@example.atlassian.net/wiki/spaces/D/pages/123",
		`${site}/wiki/x/abc`,
		`${site}/wiki/spaces/D/pages/abc`,
		`${site}/wiki/pages/viewpage.action?pageId=1/2`,
		"not-a-page",
	]) {
		expect(() => resolveConfluencePageId(reference, site)).toThrow();
	}
});
