export type ConfluenceSettings = {
	confluenceAuthMethod: "basic" | "oauth2" | "token";
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
	contentRoot: string;
	firstHeadingPageTitle: boolean;
};

export const DEFAULT_SETTINGS: ConfluenceSettings = {
	confluenceAuthMethod: "basic",
	confluenceBaseUrl: "",
	confluenceParentId: "",
	atlassianUserName: "",
	atlassianApiToken: "",
	folderToPublish: "Confluence Pages",
	contentRoot: process.cwd(),
	firstHeadingPageTitle: false,
};
