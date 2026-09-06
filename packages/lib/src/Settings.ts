import { Context } from "effect";

export type ConfluenceAuthType = "basic" | "bearer" | "oauth2";
export type PlantumlSettings = {
	enabled: boolean;
	serverUrl: string;
};

export type ConfluenceSettings = {
	confluenceBaseUrl: string;
	confluenceSiteUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	confluenceAuthType: ConfluenceAuthType;
	confluenceApiPrefix: string;
	confluenceRequestHeaders: Record<string, string>;
	atlassianClientId: string;
	atlassianClientSecret: string;
	folderToPublish: string;
	tagsToPublish: string;
	contentRoot: string;
	firstHeadingPageTitle: boolean;
	pageHeaderMarkdown?: string;
	pageFooterMarkdown?: string;
	ignoredCodeBlockLanguages?: readonly string[];
	forceOverwrite: boolean;
	plantuml: PlantumlSettings;
};

export type ConfluenceSettingsValidationIssue = {
	field: keyof ConfluenceSettings;
	message: string;
};

export type ConfluenceSettingsValidationResult = {
	valid: boolean;
	issues: ConfluenceSettingsValidationIssue[];
};

export const DEFAULT_SETTINGS: ConfluenceSettings = {
	confluenceBaseUrl: "",
	confluenceSiteUrl: "",
	confluenceParentId: "",
	atlassianUserName: "",
	atlassianApiToken: "",
	confluenceAuthType: "basic",
	confluenceApiPrefix: "/wiki/rest",
	confluenceRequestHeaders: {},
	atlassianClientId: "",
	atlassianClientSecret: "",
	folderToPublish: "Confluence Pages",
	tagsToPublish: "",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	forceOverwrite: false,
	pageHeaderMarkdown: "",
	pageFooterMarkdown: "",
	ignoredCodeBlockLanguages: [],
	plantuml: {
		enabled: false,
		serverUrl: "",
	},
};

/**
 * The human-facing Atlassian site URL used to build and match browser-facing
 * links (e.g. https://your-site.atlassian.net). Falls back to
 * `confluenceBaseUrl` when `confluenceSiteUrl` is unset, preserving existing
 * behaviour for deployments that talk directly to the site rather than the
 * API gateway (https://api.atlassian.com/ex/confluence/{cloudId}).
 */
export function resolveSiteUrl(settings: ConfluenceSettings): string {
	return settings.confluenceSiteUrl || settings.confluenceBaseUrl;
}

export class ConfluenceSettingsService extends Context.Service<
	ConfluenceSettingsService,
	ConfluenceSettings
>()("@markdown-confluence/ConfluenceSettings") {}

export function validateConfluenceSettings(
	settings: ConfluenceSettings,
): ConfluenceSettingsValidationResult {
	const issues: ConfluenceSettingsValidationIssue[] = [];

	addRequiredSettingIssue(issues, settings.confluenceBaseUrl, {
		field: "confluenceBaseUrl",
		message: "Confluence base URL is required",
	});
	addRequiredSettingIssue(issues, settings.confluenceParentId, {
		field: "confluenceParentId",
		message: "Confluence parent ID is required",
	});
	if (settings.confluenceAuthType === "basic") {
		addRequiredSettingIssue(issues, settings.atlassianUserName, {
			field: "atlassianUserName",
			message: "Atlassian user name is required",
		});
	}
	if (!["basic", "bearer", "oauth2"].includes(settings.confluenceAuthType)) {
		issues.push({
			field: "confluenceAuthType",
			message: `Unsupported Confluence auth type "${settings.confluenceAuthType}". Expected basic, bearer, or oauth2`,
		});
	}
	addRequiredSettingIssue(issues, settings.confluenceApiPrefix, {
		field: "confluenceApiPrefix",
		message: "Confluence API prefix is required",
	});
	if (settings.confluenceAuthType === "oauth2") {
		addRequiredSettingIssue(issues, settings.atlassianClientId, {
			field: "atlassianClientId",
			message: "Atlassian client ID is required when confluenceAuthType is oauth2",
		});
		addRequiredSettingIssue(issues, settings.atlassianClientSecret, {
			field: "atlassianClientSecret",
			message: "Atlassian client secret is required when confluenceAuthType is oauth2",
		});
	} else {
		addRequiredSettingIssue(issues, settings.atlassianApiToken, {
			field: "atlassianApiToken",
			message: "Atlassian API token is required",
		});
	}
	addRequiredSettingIssue(issues, settings.folderToPublish, {
		field: "folderToPublish",
		message: "Folder to publish is required",
	});
	addRequiredSettingIssue(issues, settings.contentRoot, {
		field: "contentRoot",
		message: "Content root is required",
	});

	const confluenceBaseUrl =
		typeof settings.confluenceBaseUrl === "string" ? settings.confluenceBaseUrl.trim() : "";
	if (confluenceBaseUrl) {
		const parsedUrl = parseUrl(confluenceBaseUrl);
		if (parsedUrl?.hostname === "api.atlassian.com" && !settings.confluenceSiteUrl?.trim()) {
			issues.push({
				field: "confluenceSiteUrl",
				message:
					"Confluence site URL is required when confluenceBaseUrl points at the Atlassian API gateway",
			});
		}
		if (!parsedUrl) {
			issues.push({
				field: "confluenceBaseUrl",
				message: "Confluence base URL must be a valid URL",
			});
		} else if (!["http:", "https:"].includes(parsedUrl.protocol)) {
			issues.push({
				field: "confluenceBaseUrl",
				message: "Confluence base URL must start with http:// or https://",
			});
		}

		if (confluenceBaseUrl.endsWith("/")) {
			issues.push({
				field: "confluenceBaseUrl",
				message: "Confluence base URL must not end with a slash",
			});
		}
	}
	if (settings.confluenceSiteUrl) {
		const siteUrl = parseUrl(settings.confluenceSiteUrl);
		if (
			!siteUrl ||
			!["http:", "https:"].includes(siteUrl.protocol) ||
			settings.confluenceSiteUrl.endsWith("/")
		) {
			issues.push({
				field: "confluenceSiteUrl",
				message:
					"Confluence site URL must be an http:// or https:// URL without a trailing slash",
			});
		}
	}

	return {
		valid: issues.length === 0,
		issues,
	};
}

function addRequiredSettingIssue(
	issues: ConfluenceSettingsValidationIssue[],
	value: unknown,
	issue: ConfluenceSettingsValidationIssue,
) {
	if (typeof value === "string" && value.trim()) {
		return;
	}

	issues.push(issue);
}

function parseUrl(value: string): URL | undefined {
	try {
		return new URL(value);
	} catch {
		return undefined;
	}
}
