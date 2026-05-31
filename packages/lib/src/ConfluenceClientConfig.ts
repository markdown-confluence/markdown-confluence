import type { Config } from "confluence.js";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "./Settings";

export const DEFAULT_CONFLUENCE_API_PREFIX = DEFAULT_SETTINGS.confluenceApiPrefix;

export function createConfluenceClientConfig(
	settings: ConfluenceSettings,
	config: Pick<Config, "middlewares"> = {},
): Config {
	return {
		host: settings.confluenceBaseUrl,
		apiPrefix: normalizeConfluenceApiPrefix(settings.confluenceApiPrefix),
		authentication:
			settings.confluenceAuthType === "bearer"
				? {
						oauth2: {
							accessToken: settings.atlassianApiToken,
						},
					}
				: {
						basic: {
							email: settings.atlassianUserName,
							apiToken: settings.atlassianApiToken,
						},
					},
		baseRequestConfig: hasRequestHeaders(settings.confluenceRequestHeaders)
			? {
					headers: settings.confluenceRequestHeaders,
				}
			: undefined,
		...config,
	};
}

export function normalizeConfluenceApiPrefix(apiPrefix: string): string {
	const trimmedApiPrefix = apiPrefix.trim();
	if (!trimmedApiPrefix) {
		return DEFAULT_CONFLUENCE_API_PREFIX;
	}

	const prefixedApiPrefix = trimmedApiPrefix.startsWith("/")
		? trimmedApiPrefix
		: `/${trimmedApiPrefix}`;

	return prefixedApiPrefix.replace(/\/+$/, "");
}

function hasRequestHeaders(headers: Record<string, string>): boolean {
	return Object.keys(headers).length > 0;
}
