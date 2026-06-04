import { Context } from "effect";

export type PlantumlSettings = {
	enabled: boolean;
	serverUrl: string;
};

export type ConfluenceSettings = {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
	contentRoot: string;
	firstHeadingPageTitle: boolean;
	plantuml: PlantumlSettings;
};

export const DEFAULT_SETTINGS: ConfluenceSettings = {
	confluenceBaseUrl: "",
	confluenceParentId: "",
	atlassianUserName: "",
	atlassianApiToken: "",
	folderToPublish: "Confluence Pages",
	contentRoot: ".",
	firstHeadingPageTitle: false,
	plantuml: {
		enabled: true,
		serverUrl: "https://www.plantuml.com/plantuml",
	},
};

export class ConfluenceSettingsService extends Context.Service<
	ConfluenceSettingsService,
	ConfluenceSettings
>()("@markdown-confluence/ConfluenceSettings") {}
