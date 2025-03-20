/**
 * ConfigMigrator
 * 
 * Handles settings format migrations and backward compatibility.
 * Ensures that old settings formats can be safely upgraded to new formats.
 */

import { ObsidianPluginSettings, PublishMapping } from "../models/Types";
import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { LoggerManager } from "../utils/LoggerManager";

/**
 * Version history of the settings format
 */
export enum SettingsVersion {
	LEGACY = 0,        // Original format with single folderToPublish and confluenceParentId
	MULTI_MAPPING = 1, // Multi-mapping format with publishMappings array
	// Add new versions here as the settings format evolves
}

export interface MigrationResult {
	/** Whether the migration was successful */
	success: boolean;
	/** The updated settings object */
	settings: ObsidianPluginSettings;
	/** The version the settings were migrated to */
	migratedToVersion: SettingsVersion;
	/** Optional error message if migration failed */
	error?: string;
}

export class ConfigMigrator {
	private static instance: ConfigMigrator;
	private logger = LoggerManager.getInstance().getComponentLogger('ConfigMigrator');
	private errorHandler = ErrorHandler.getInstance();

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() { }

	/**
	 * Get the singleton instance of ConfigMigrator
	 */
	public static getInstance(): ConfigMigrator {
		if (!ConfigMigrator.instance) {
			ConfigMigrator.instance = new ConfigMigrator();
		}
		return ConfigMigrator.instance;
	}

	/**
	 * Detect the version of the provided settings
	 * 
	 * @param settings The settings object to check
	 * @returns The detected settings version
	 */
	public detectVersion(settings: Partial<ObsidianPluginSettings>): SettingsVersion {
		if (settings.publishMappings && Array.isArray(settings.publishMappings)) {
			return SettingsVersion.MULTI_MAPPING;
		}
		return SettingsVersion.LEGACY;
	}

	/**
	 * Migrate settings from one version to another
	 * 
	 * @param settings The settings object to migrate
	 * @param targetVersion The target version to migrate to
	 * @returns The migration result
	 */
	public migrateSettings(
		settings: Partial<ObsidianPluginSettings>,
		targetVersion: SettingsVersion = SettingsVersion.MULTI_MAPPING
	): MigrationResult {
		try {
			const currentVersion = this.detectVersion(settings);
			this.logger.debug(`Migrating settings from version ${currentVersion} to ${targetVersion}`);

			// If already at target version, return as is
			if (currentVersion === targetVersion) {
				return {
					success: true,
					settings: settings as ObsidianPluginSettings,
					migratedToVersion: currentVersion
				};
			}

			// Depending on the current and target versions, perform necessary migrations
			let migratedSettings = { ...settings };

			if (currentVersion === SettingsVersion.LEGACY && targetVersion >= SettingsVersion.MULTI_MAPPING) {
				migratedSettings = this.migrateFromLegacyToMultiMapping(migratedSettings);
			}

			// Additional migration steps would be added here for future versions

			return {
				success: true,
				settings: migratedSettings as ObsidianPluginSettings,
				migratedToVersion: targetVersion
			};
		} catch (error) {
			const errorMessage = this.errorHandler.formatError(error);
			this.logger.error(`Migration failed: ${errorMessage}`, error);

			this.errorHandler.handleError({
				message: `Failed to migrate settings: ${errorMessage}`,
				component: 'ConfigMigrator',
				error,
				level: ErrorLevel.ERROR,
				showNotice: false
			});

			return {
				success: false,
				settings: settings as ObsidianPluginSettings,
				migratedToVersion: this.detectVersion(settings),
				error: errorMessage
			};
		}
	}

	/**
	 * Migrate from legacy settings format to multi-mapping format
	 * 
	 * @param settings The legacy settings to migrate
	 * @returns The migrated settings
	 */
	private migrateFromLegacyToMultiMapping(settings: Partial<ObsidianPluginSettings>): Partial<ObsidianPluginSettings> {
		this.logger.info('Migrating from legacy settings format to multi-mapping format');

		const migratedSettings = { ...settings };

		if (settings.folderToPublish && settings.confluenceParentId) {
			// Create publishMappings array if it doesn't exist
			if (!migratedSettings.publishMappings) {
				migratedSettings.publishMappings = [];
			}

			// Only add the mapping if it doesn't already exist
			const existingMappingIndex = migratedSettings.publishMappings.findIndex(
				mapping => mapping.folderToPublish === settings.folderToPublish &&
					mapping.confluenceParentId === settings.confluenceParentId
			);

			if (existingMappingIndex === -1) {
				const legacyMapping: PublishMapping = {
					folderToPublish: settings.folderToPublish,
					confluenceParentId: settings.confluenceParentId,
					label: 'Default Mapping'
				};

				migratedSettings.publishMappings.push(legacyMapping);
				migratedSettings.activeMappingIndex = 0;

				this.logger.debug('Added legacy mapping to publishMappings array', { legacyMapping });
			} else {
				this.logger.debug('Legacy mapping already exists in publishMappings array');
			}
		} else {
			// Initialize empty mappings if no legacy mapping exists
			if (!migratedSettings.publishMappings) {
				migratedSettings.publishMappings = [];
				migratedSettings.activeMappingIndex = 0;
			}
		}

		return migratedSettings;
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		ConfigMigrator.instance = undefined as unknown as ConfigMigrator;
	}
} 