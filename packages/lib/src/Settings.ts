import { Context } from "effect";

export type ConfluenceAuthType = "basic" | "bearer";

export type ConfluenceSettings = {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	confluenceAuthType: ConfluenceAuthType;
	confluenceApiPrefix: string;
	confluenceRequestHeaders: Record<string, string>;
	folderToPublish: string;
	contentRoot: string;
	firstHeadingPageTitle: boolean;
};

export const DEFAULT_SETTINGS: ConfluenceSettings = {
	confluenceBaseUrl: "",
	confluenceParentId: "",
	atlassianUserName: "",
	atlassianApiToken: "",
	confluenceAuthType: "basic",
	confluenceApiPrefix: "/wiki/rest",
	confluenceRequestHeaders: {},
	folderToPublish: "Confluence Pages",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};

export class ConfluenceSettingsService extends Context.Service<
	ConfluenceSettingsService,
	ConfluenceSettings
>()("@markdown-confluence/ConfluenceSettings") {}
