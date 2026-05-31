import { Context } from "effect";

export type ConfluenceSettings = {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
	contentRoot: string;
	firstHeadingPageTitle: boolean;
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
	confluenceParentId: "",
	atlassianUserName: "",
	atlassianApiToken: "",
	folderToPublish: "Confluence Pages",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};

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
	addRequiredSettingIssue(issues, settings.atlassianUserName, {
		field: "atlassianUserName",
		message: "Atlassian user name is required",
	});
	addRequiredSettingIssue(issues, settings.atlassianApiToken, {
		field: "atlassianApiToken",
		message: "Atlassian API token is required",
	});
	addRequiredSettingIssue(issues, settings.folderToPublish, {
		field: "folderToPublish",
		message: "Folder to publish is required",
	});
	addRequiredSettingIssue(issues, settings.contentRoot, {
		field: "contentRoot",
		message: "Content root is required",
	});

	const confluenceBaseUrl = settings.confluenceBaseUrl.trim();
	if (confluenceBaseUrl) {
		const parsedUrl = parseUrl(confluenceBaseUrl);
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

	return {
		valid: issues.length === 0,
		issues,
	};
}

function addRequiredSettingIssue(
	issues: ConfluenceSettingsValidationIssue[],
	value: string,
	issue: ConfluenceSettingsValidationIssue,
) {
	if (value.trim()) {
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
