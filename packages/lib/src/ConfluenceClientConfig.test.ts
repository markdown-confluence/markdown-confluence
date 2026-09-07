import { expect, test } from "@effect/vitest";
import {
	createConfluenceClientConfig,
	normalizeConfluenceApiPrefix,
} from "./ConfluenceClientConfig";
import { DEFAULT_SETTINGS } from "./Settings";

test("creates SDK v3 basic auth configuration with a shared Cloud host", () => {
	expect(
		createConfluenceClientConfig({
			...DEFAULT_SETTINGS,
			confluenceBaseUrl: "https://example.atlassian.net/",
			atlassianUserName: "user@example.com",
			atlassianApiToken: "token",
		}),
	).toEqual({
		host: "https://example.atlassian.net",
		auth: { type: "basic", email: "user@example.com", apiToken: "token" },
		headers: {},
	});
});
test("creates bearer configuration while endpoint paths belong to the SDK", () => {
	expect(
		createConfluenceClientConfig({
			...DEFAULT_SETTINGS,
			confluenceBaseUrl: "https://api.atlassian.com/ex/confluence/cloud-id",
			confluenceAuthType: "bearer",
			atlassianApiToken: "access-token",
			confluenceRequestHeaders: { "X-Route": "tenant" },
		}),
	).toEqual({
		host: "https://api.atlassian.com/ex/confluence/cloud-id",
		auth: { type: "bearer", token: "access-token" },
		headers: { "X-Route": "tenant" },
	});
});
test("retains the deprecated API-prefix normalizer for library callers", () => {
	expect(normalizeConfluenceApiPrefix("")).toBe("/wiki/rest");
	expect(normalizeConfluenceApiPrefix("rest/")).toBe("/rest");
});
