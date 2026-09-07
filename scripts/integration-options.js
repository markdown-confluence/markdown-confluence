export const integrationProfiles = [
	"quick",
	"packages",
	"live",
	"regressions",
	"docker",
	"vault",
	"obsidian",
];

export function parseIntegrationOptions(argv) {
	const options = { profile: "quick", skipBuild: false };
	const args = [...argv];
	if (args[0] && !args[0].startsWith("--")) options.profile = args.shift();
	if (!integrationProfiles.includes(options.profile))
		throw new Error(`Unknown integration profile: ${options.profile}`);
	const valueOptions = { "--vault": "vault", "--settings-from": "settingsFile" };
	while (args.length) {
		const argument = args.shift();
		if (argument === "--") continue;
		if (argument === "--skip-build") options.skipBuild = true;
		else if (argument === "--dataview") options.dataview = true;
		else if (argument === "--help") options.help = true;
		else if (valueOptions[argument]) {
			const value = args.shift();
			if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path`);
			options[valueOptions[argument]] = value;
		} else throw new Error(`Unknown integration option: ${argument}`);
	}
	if (options.dataview && options.profile !== "obsidian")
		throw new Error("--dataview requires the obsidian profile");
	return options;
}

/** Require an explicit remote destination before starting any build or publication. */
export function validateLiveEnvironment(environment) {
	const oauth = environment.CONFLUENCE_E2E_AUTH_TYPE === "oauth2";
	if (
		environment.CONFLUENCE_E2E_AUTH_TYPE &&
		!["basic", "oauth2"].includes(environment.CONFLUENCE_E2E_AUTH_TYPE)
	)
		throw new Error("CONFLUENCE_E2E_AUTH_TYPE must be basic or oauth2");
	for (const name of [
		...(oauth
			? ["ATLASSIAN_CLIENT_ID", "ATLASSIAN_CLIENT_SECRET", "CONFLUENCE_E2E_API_URL"]
			: ["ATLASSIAN_USERNAME", "ATLASSIAN_API_TOKEN"]),
		"CONFLUENCE_E2E_BASE_URL",
		"CONFLUENCE_E2E_PARENT_ID",
		"CONFLUENCE_E2E_SPACE_KEY",
	]) {
		if (!environment[name]?.trim())
			throw new Error(
				`Missing ${name}. Configure .env.integration; see documentation/TESTING.md.`,
			);
	}
	const url = new URL(environment.CONFLUENCE_E2E_BASE_URL);
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		!["", "/"].includes(url.pathname)
	)
		throw new Error(
			"CONFLUENCE_E2E_BASE_URL must be an HTTPS origin without credentials or a path",
		);
	if (!/^\d+$/.test(environment.CONFLUENCE_E2E_PARENT_ID))
		throw new Error("CONFLUENCE_E2E_PARENT_ID must be a numeric page ID");
	if (environment.CONFLUENCE_E2E_API_URL) {
		const api = new URL(environment.CONFLUENCE_E2E_API_URL);
		if (
			api.origin !== "https://api.atlassian.com" ||
			api.username ||
			api.password ||
			api.search ||
			api.hash ||
			!/^\/ex\/confluence\/[a-zA-Z0-9-]+\/?$/.test(api.pathname)
		)
			throw new Error(
				"CONFLUENCE_E2E_API_URL must be https://api.atlassian.com/ex/confluence/{cloudId}",
			);
	}
}

export function liveConnectionSettings(environment) {
	validateLiveEnvironment(environment);
	const oauth = environment.CONFLUENCE_E2E_AUTH_TYPE === "oauth2";
	return {
		confluenceAuthType: oauth ? "oauth2" : "basic",
		confluenceBaseUrl:
			environment.CONFLUENCE_E2E_API_URL || environment.CONFLUENCE_E2E_BASE_URL,
		confluenceSiteUrl: environment.CONFLUENCE_E2E_BASE_URL,
		confluenceParentId: environment.CONFLUENCE_E2E_PARENT_ID,
		atlassianUserName: oauth ? "" : environment.ATLASSIAN_USERNAME,
		atlassianApiToken: oauth ? "" : environment.ATLASSIAN_API_TOKEN,
		atlassianClientId: oauth ? environment.ATLASSIAN_CLIENT_ID : "",
		atlassianClientSecret: oauth ? environment.ATLASSIAN_CLIENT_SECRET : "",
	};
}
