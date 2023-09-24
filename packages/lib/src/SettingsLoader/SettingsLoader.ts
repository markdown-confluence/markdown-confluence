import { ConfluenceSettings } from "../Settings";

export abstract class SettingsLoader {
	abstract loadPartial(): Partial<ConfluenceSettings>;

	load(): ConfluenceSettings {
		const initialSettings = this.loadPartial();
		const settings = this.validateSettings(initialSettings);
		return settings;
	}

	protected validateSettings(
		settings: Partial<ConfluenceSettings>,
	): ConfluenceSettings {
		if (!settings.confluenceBaseUrl) {
			throw new Error("Confluence base URL is required");
		}

		if (!settings.confluenceParentId) {
			throw new Error("Confluence parent ID is required");
		}

		if (!settings.atlassianUserName) {
			throw new Error("Atlassian user name is required");
		}

		if (!settings.atlassianApiToken) {
			throw new Error("Atlassian API token is required");
		}

		if (!settings.folderToPublish) {
			throw new Error("Folder to publish is required");
		}

		if (!settings.contentRoot) {
			throw new Error("Content root is required");
		} else {
			if (!settings.contentRoot.endsWith("/")) {
				settings.contentRoot += "/";
			}
		}

		if (!("firstHeadingPageTitle" in settings)) {
			settings.firstHeadingPageTitle = false;
		}

		return settings as ConfluenceSettings;
	}
}
