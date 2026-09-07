import type { ClientConfig } from "confluence.js/core";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";

export const DEFAULT_CONFLUENCE_API_PREFIX = DEFAULT_SETTINGS.confluenceApiPrefix;

/** The SDK owns endpoint paths. Both REST versions share the same Cloud host and authentication. */
export function createConfluenceClientConfig(settings: ConfluenceSettings): ClientConfig {
	return {
		host: settings.confluenceBaseUrl.replace(/\/$/, ""),
		auth:
			settings.confluenceAuthType === "basic"
				? {
						type: "basic",
						email: settings.atlassianUserName,
						apiToken: settings.atlassianApiToken,
					}
				: { type: "bearer", token: settings.atlassianApiToken },
		headers: settings.confluenceRequestHeaders,
	};
}

/** @deprecated Cloud endpoint paths are supplied by confluence.js v3. */
export function normalizeConfluenceApiPrefix(apiPrefix: string): string {
	const trimmedApiPrefix = apiPrefix.trim();
	if (!trimmedApiPrefix) {
		return DEFAULT_CONFLUENCE_API_PREFIX;
	}

	const prefixedApiPrefix = trimmedApiPrefix.startsWith("/")
		? trimmedApiPrefix
		: `/${trimmedApiPrefix}`;

	let end = prefixedApiPrefix.length;
	while (end > 0 && prefixedApiPrefix[end - 1] === "/") end--;
	return prefixedApiPrefix.slice(0, end);
}
