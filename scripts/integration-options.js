export const integrationProfiles = ["quick", "packages", "live", "docker", "vault", "obsidian"];

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
		else if (argument === "--help") options.help = true;
		else if (valueOptions[argument]) {
			const value = args.shift();
			if (!value || value.startsWith("--")) throw new Error(`${argument} requires a path`);
			options[valueOptions[argument]] = value;
		} else throw new Error(`Unknown integration option: ${argument}`);
	}
	return options;
}

/** Require an explicit remote destination before starting any build or publication. */
export function validateLiveEnvironment(environment) {
	for (const name of [
		"ATLASSIAN_USERNAME",
		"ATLASSIAN_API_TOKEN",
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
}
