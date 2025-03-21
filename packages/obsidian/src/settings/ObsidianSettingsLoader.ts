import { ConfluenceUploadSettings, SettingsLoader } from "@markdown-confluence/lib";
import { App } from "obsidian";
import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { LoggerManager } from "../utils/LoggerManager";
import { SettingsManager } from "./SettingsManager";

/**
 * Settings loader that dynamically pulls settings from SettingsManager
 * to ensure the Publisher always uses the latest settings
 */
export class ObsidianSettingsLoader extends SettingsLoader {
	private settingsManager: SettingsManager;
	private logger = LoggerManager.getInstance().getComponentLogger('ObsidianSettingsLoader');
	private errorHandler = ErrorHandler.getInstance();
	private app: App | null = null;

	constructor(settingsManager: SettingsManager, app?: App) {
		super();
		this.settingsManager = settingsManager;
		this.app = app || null;
	}

	loadPartial(): Partial<ConfluenceUploadSettings.ConfluenceSettings> {
		try {
			// Get the latest settings directly from the SettingsManager
			const settings = this.settingsManager.getSettings();

			// Get vault path for content root
			let contentRoot = "/";
			if (this.app) {
				// If we have access to the app, use the vault adapter's basePath
				// @ts-ignore - Private property access but necessary for content root
				contentRoot = this.app.vault.adapter.basePath;
			}

			// Log the settings being used for debugging purposes
			this.logger.debug('Loading current settings for publishing', {
				confluenceParentId: settings.confluenceParentId,
				folderToPublish: settings.folderToPublish,
				contentRoot
			});

			// Convert Obsidian plugin settings to the format expected by the Publisher
			return {
				confluenceBaseUrl: settings.confluenceBaseUrl,
				confluenceParentId: settings.confluenceParentId,
				atlassianUserName: settings.atlassianUserName,
				atlassianApiToken: settings.atlassianApiToken,
				folderToPublish: settings.folderToPublish,
				contentRoot: contentRoot,
				firstHeadingPageTitle: settings.firstHeadingPageTitle
			};
		} catch (error) {
			this.errorHandler.handleError({
				message: 'Failed to load settings for publisher',
				error,
				component: 'ObsidianSettingsLoader',
				level: ErrorLevel.ERROR
			});

			// Return empty object to let the SettingsLoader parent class
			// validate and report the missing fields
			return {};
		}
	}
} 