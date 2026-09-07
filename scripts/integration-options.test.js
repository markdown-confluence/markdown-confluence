import { expect, test } from "@effect/vitest";
import { parseIntegrationOptions, validateLiveEnvironment } from "./integration-options.js";
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
