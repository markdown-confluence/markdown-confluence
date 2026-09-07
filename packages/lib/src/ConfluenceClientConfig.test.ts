import { expect, test } from "@effect/vitest";
import {
	createConfluenceClientConfig,
	normalizeConfluenceApiPrefix,
} from "./ConfluenceClientConfig";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";

test("creates default basic auth Confluence client config", () => {
	const config = createConfluenceClientConfig(makeSettings());

	expect(config).toEqual({
		host: "https://example.atlassian.net",
		apiPrefix: "/wiki/rest",
		authentication: {
			basic: {
				email: "user@example.com",
				apiToken: "token",
			},
		},
		baseRequestConfig: { timeout: 30_000, adapter: expect.any(Function) },
	});
});

test("creates bearer auth config with custom API prefix and request headers", () => {
	const config = createConfluenceClientConfig(
		makeSettings({
			atlassianUserName: "",
			atlassianApiToken: "personal-access-token",
			confluenceAuthType: "bearer",
			confluenceApiPrefix: "rest/",
			confluenceRequestHeaders: {
				"X-Custom-Header": "tenant",
			},
		}),
		{
			middlewares: {
				onError: () => undefined,
			},
		},
	);

	expect(config).toMatchObject({
		host: "https://example.atlassian.net",
		apiPrefix: "/rest",
		authentication: {
			oauth2: {
				accessToken: "personal-access-token",
			},
		},
		baseRequestConfig: {
			headers: {
				"X-Custom-Header": "tenant",
			},
		},
		middlewares: {
			onError: expect.any(Function),
		},
	});
});

test("normalizes Confluence API prefixes", () => {
	expect(normalizeConfluenceApiPrefix("")).toBe("/wiki/rest");
	expect(normalizeConfluenceApiPrefix("rest")).toBe("/rest");
	expect(normalizeConfluenceApiPrefix("/rest/")).toBe("/rest");
	expect(normalizeConfluenceApiPrefix("/")).toBe("");
});

function makeSettings(settings: Partial<ConfluenceSettings> = {}): ConfluenceSettings {
	return {
		...DEFAULT_SETTINGS,
		confluenceBaseUrl: "https://example.atlassian.net",
		confluenceParentId: "123456",
		atlassianUserName: "user@example.com",
		atlassianApiToken: "token",
		...settings,
	};
}
