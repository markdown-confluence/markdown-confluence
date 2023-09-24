import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";

export class EnvironmentVariableSettingsLoader extends SettingsLoader {
	getValue<T extends keyof ConfluenceSettings>(
		propertyKey: T,
		envVar: string,
	): Partial<ConfluenceSettings> {
		const value = process.env[envVar];
		return value ? { [propertyKey]: value } : {};
	}

	loadPartial(): Partial<ConfluenceSettings> {
		return {
			...this.getValue("confluenceBaseUrl", "CONFLUENCE_BASE_URL"),
			...this.getValue("confluenceParentId", "CONFLUENCE_PARENT_ID"),
			...this.getValue("atlassianUserName", "ATLASSIAN_USERNAME"),
			...this.getValue("atlassianApiToken", "ATLASSIAN_API_TOKEN"),
			...this.getValue("folderToPublish", "FOLDER_TO_PUBLISH"),
			...this.getValue("contentRoot", "CONFLUENCE_CONTENT_ROOT"),
			firstHeadingPageTitle:
				(process.env["CONFLUENCE_FIRST_HEADING_PAGE_TITLE"] ??
					"false") === "true",
		};
	}
}
