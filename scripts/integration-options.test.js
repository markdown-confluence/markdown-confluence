import { expect, test } from "@effect/vitest";
import {
	liveConnectionSettings,
	parseIntegrationOptions,
	validateLiveEnvironment,
} from "./integration-options.js";
import { parseObsidianOutput } from "./integration-obsidian.js";

test("does not treat a successful CLI exit without a result as a passing desktop test", () => {
	expect(parseObsidianOutput('=> {"ready":true}\n')).toEqual({ ready: true });
	for (const output of [
		"",
		"Command line interface is not enabled.",
		"Error: Vault not found",
		"=> invalid-json\n",
	])
		expect(() => parseObsidianOutput(output)).toThrow();
});

test("defaults to credential-free checks and rejects misspelled live options", () => {
	expect(parseIntegrationOptions([])).toEqual({ profile: "quick", skipBuild: false });
	expect(parseIntegrationOptions(["packages", "--skip-build"]).skipBuild).toBe(true);
	expect(() => parseIntegrationOptions(["lve"])).toThrow("Unknown integration profile");
	expect(() => parseIntegrationOptions(["live", "--settings-from"])).toThrow("requires a path");
	expect(() => parseIntegrationOptions(["live", "--skip-buid"])).toThrow(
		"Unknown integration option",
	);
});

const configured = {
	ATLASSIAN_USERNAME: "integration@example.test",
	ATLASSIAN_API_TOKEN: "test-token",
	CONFLUENCE_E2E_BASE_URL: "https://example.atlassian.net",
	CONFLUENCE_E2E_PARENT_ID: "1234",
	CONFLUENCE_E2E_SPACE_KEY: "TEST",
};

test("requires every live destination and credential field before publication", () => {
	expect(() => validateLiveEnvironment(configured)).not.toThrow();
	for (const key of Object.keys(configured)) {
		expect(() => validateLiveEnvironment({ ...configured, [key]: "" })).toThrow(
			`Missing ${key}`,
		);
	}
});

test("rejects ambiguous or credential-bearing test destinations", () => {
	for (const base of [
		"http://example.test",
		"https://user:secret@example.test",
		"https://example.test/wiki",
		"https://example.test/?token=secret",
		"https://example.test/#secret",
	]) {
		expect(() =>
			validateLiveEnvironment({ ...configured, CONFLUENCE_E2E_BASE_URL: base }),
		).toThrow();
	}
	expect(() =>
		validateLiveEnvironment({ ...configured, CONFLUENCE_E2E_PARENT_ID: "not-a-page" }),
	).toThrow("numeric page ID");
});

test("Dataview integration is explicitly limited to the desktop profile", () => {
	expect(parseIntegrationOptions(["obsidian", "--dataview"]).dataview).toBe(true);
	expect(() => parseIntegrationOptions(["live", "--dataview"])).toThrow(
		"requires the obsidian profile",
	);
});

test("OAuth live verification needs client credentials and a separate Cloud gateway", () => {
	const oauth = {
		...configured,
		CONFLUENCE_E2E_AUTH_TYPE: "oauth2",
		CONFLUENCE_E2E_API_URL: "https://api.atlassian.com/ex/confluence/cloud-id",
		ATLASSIAN_CLIENT_ID: "test-id",
		ATLASSIAN_CLIENT_SECRET: "test-secret",
		ATLASSIAN_USERNAME: "",
		ATLASSIAN_API_TOKEN: "",
	};
	expect(liveConnectionSettings(oauth)).toMatchObject({
		confluenceAuthType: "oauth2",
		confluenceBaseUrl: oauth.CONFLUENCE_E2E_API_URL,
		confluenceSiteUrl: configured.CONFLUENCE_E2E_BASE_URL,
		atlassianApiToken: "",
		atlassianClientSecret: "test-secret",
	});
	for (const key of ["ATLASSIAN_CLIENT_ID", "ATLASSIAN_CLIENT_SECRET", "CONFLUENCE_E2E_API_URL"])
		expect(() => validateLiveEnvironment({ ...oauth, [key]: "" })).toThrow(`Missing ${key}`);
	for (const api of [
		"https://example.atlassian.net",
		"https://api.atlassian.com/ex/jira/cloud-id",
		"https://api.atlassian.com/ex/confluence/cloud-id?token=secret",
		"https://user:password@api.atlassian.com/ex/confluence/cloud-id",
	])
		expect(() => validateLiveEnvironment({ ...oauth, CONFLUENCE_E2E_API_URL: api })).toThrow(
			"CONFLUENCE_E2E_API_URL",
		);
});
