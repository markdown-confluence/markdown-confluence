/**
 * SettingsManager
 * 
 * Manages settings for the Obsidian Confluence plugin.
 * Handles loading, saving, and migrating settings.
 */

import { ConfluenceUploadSettings } from "@markdown-confluence/lib";
import { Plugin } from "obsidian";
import { EventCoordinator } from "../events/EventCoordinator";
import { ConfigMigrator, SettingsVersion } from "../migrations/ConfigMigrator";
import { ObsidianPluginSettings, PublishMapping } from "../models/Types";
import { StateChangeEvent } from "../state/StateManager";
import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { LoggerManager } from "../utils/LoggerManager";

export enum SettingsEvent {
	SETTINGS_CHANGED = 'settings-changed',
	MAPPINGS_CHANGED = 'mappings-changed'
}

export class SettingsManager {
	private static instance: SettingsManager;
	private plugin: Plugin | null = null;
	private settings: ObsidianPluginSettings;
	private logger = LoggerManager.getInstance().getComponentLogger('SettingsManager');
	private errorHandler = ErrorHandler.getInstance();
	private configMigrator = ConfigMigrator.getInstance();
	private eventCoordinator = EventCoordinator.getInstance();

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() {
		// Initialize with default settings
		this.settings = {
			...ConfluenceUploadSettings.DEFAULT_SETTINGS,
			mermaidTheme: "match-obsidian",
			logLevel: 3, // SILENT
			publishMappings: [],
			activeMappingIndex: 0,
		};
	}

	/**
	 * Get the singleton instance of SettingsManager
	 */
	public static getInstance(): SettingsManager {
		if (!SettingsManager.instance) {
			SettingsManager.instance = new SettingsManager();
		}
		return SettingsManager.instance;
	}

	/**
	 * Initialize the settings manager with a plugin instance
	 * @param plugin The Obsidian plugin instance
	 */
	public initialize(plugin: Plugin): void {
		this.plugin = plugin;
	}

	/**
	 * Load settings from storage
	 */
	public async loadSettings(): Promise<void> {
		if (!this.plugin) {
			this.errorHandler.handleError({
				message: 'Cannot load settings: plugin not initialized',
				component: 'SettingsManager',
				level: ErrorLevel.ERROR
			});
			return;
		}

		try {
			this.logger.debug('Loading plugin settings');
			const loadedData = await this.plugin.loadData();

			// Apply migrations if necessary
			const migrationResult = this.configMigrator.migrateSettings(
				loadedData || {},
				SettingsVersion.MULTI_MAPPING
			);

			if (!migrationResult.success && migrationResult.error) {
				this.logger.error(`Settings migration failed: ${migrationResult.error}`);
			}

			this.settings = Object.assign(
				{
					...ConfluenceUploadSettings.DEFAULT_SETTINGS,
					mermaidTheme: "match-obsidian",
					logLevel: 3, // SILENT
					publishMappings: [],
					activeMappingIndex: 0,
				},
				migrationResult.settings
			);

			this.logger.debug('Settings loaded successfully', {
				activeMappingIndex: this.settings.activeMappingIndex,
				mappingsCount: this.settings.publishMappings.length
			});

			// Notify that settings have been loaded
			this.eventCoordinator.publish(SettingsEvent.SETTINGS_CHANGED, this.settings);
		} catch (error) {
			this.errorHandler.handleError({
				message: 'Failed to load settings',
				error,
				component: 'SettingsManager',
				level: ErrorLevel.ERROR
			});
		}
	}

	/**
	 * Save settings to storage
	 * @param reinitialize Whether to trigger reinitialization after saving
	 */
	public async saveSettings(reinitialize = true): Promise<void> {
		if (!this.plugin) {
			this.errorHandler.handleError({
				message: 'Cannot save settings: plugin not initialized',
				component: 'SettingsManager',
				level: ErrorLevel.ERROR
			});
			return;
		}

		try {
			this.logger.debug('Saving plugin settings', {
				reinitialize,
				activeMappingIndex: this.settings.activeMappingIndex,
				mappingsCount: this.settings.publishMappings.length
			});

			await this.plugin.saveData(this.settings);
			this.logger.debug('Settings saved successfully');

			// Notify that settings have been saved
			this.eventCoordinator.publish(SettingsEvent.SETTINGS_CHANGED, this.settings, reinitialize);
		} catch (error) {
			this.errorHandler.handleError({
				message: 'Failed to save settings',
				error,
				component: 'SettingsManager',
				level: ErrorLevel.ERROR
			});
		}
	}

	/**
	 * Get the current settings
	 */
	public getSettings(): ObsidianPluginSettings {
		return { ...this.settings };
	}

	/**
	 * Update settings
	 * @param settings Partial settings to update
	 * @param reinitialize Whether to trigger reinitialization after saving
	 */
	public async updateSettings(settings: Partial<ObsidianPluginSettings>, reinitialize = true): Promise<void> {
		this.settings = { ...this.settings, ...settings };
		await this.saveSettings(reinitialize);
	}

	/**
	 * Get all publish mappings
	 */
	public getPublishMappings(): PublishMapping[] {
		return [...this.settings.publishMappings];
	}

	/**
	 * Get the active mapping
	 */
	public getActiveMapping(): PublishMapping | null {
		if (this.settings.publishMappings.length === 0) {
			return null;
		}

		if (this.settings.activeMappingIndex >= this.settings.publishMappings.length) {
			this.settings.activeMappingIndex = 0;
		}

		return this.settings.publishMappings[this.settings.activeMappingIndex] || null;
	}

	/**
	 * Set the active mapping by index
	 * @param index The index of the mapping to set active
	 */
	public async setActiveMapping(index: number): Promise<void> {
		if (index >= 0 && index < this.settings.publishMappings.length) {
			this.settings.activeMappingIndex = index;
			await this.saveSettings(false);

			// Notify about active mapping change
			this.eventCoordinator.publish(StateChangeEvent.ACTIVE_MAPPING_CHANGED, index);
		} else {
			this.errorHandler.handleError({
				message: `Invalid mapping index: ${index}`,
				component: 'SettingsManager',
				level: ErrorLevel.WARNING,
				showNotice: false
			});
		}
	}

	/**
	 * Add a new mapping
	 * @param mapping The mapping to add
	 * @returns The index of the new mapping
	 */
	public async addMapping(mapping: PublishMapping): Promise<number> {
		if (!mapping) {
			this.errorHandler.handleError({
				message: 'Cannot add undefined mapping',
				component: 'SettingsManager',
				level: ErrorLevel.WARNING,
				showNotice: false
			});
			return -1;
		}

		this.settings.publishMappings.push(mapping);
		const newIndex = this.settings.publishMappings.length - 1;
		await this.saveSettings(false);

		// Notify about mapping change
		this.eventCoordinator.publish(SettingsEvent.MAPPINGS_CHANGED, this.settings.publishMappings);

		return newIndex;
	}

	/**
	 * Remove a mapping by index
	 * @param index The index of the mapping to remove
	 */
	public async removeMapping(index: number): Promise<void> {
		if (index >= 0 && index < this.settings.publishMappings.length) {
			this.settings.publishMappings.splice(index, 1);

			// Adjust active mapping index if needed
			if (this.settings.activeMappingIndex >= this.settings.publishMappings.length) {
				this.settings.activeMappingIndex = Math.max(0, this.settings.publishMappings.length - 1);

				// Notify about active mapping change if it was changed
				this.eventCoordinator.publish(StateChangeEvent.ACTIVE_MAPPING_CHANGED, this.settings.activeMappingIndex);
			}

			await this.saveSettings(false);

			// Notify about mapping change
			this.eventCoordinator.publish(SettingsEvent.MAPPINGS_CHANGED, this.settings.publishMappings);
		} else {
			this.errorHandler.handleError({
				message: `Invalid mapping index: ${index}`,
				component: 'SettingsManager',
				level: ErrorLevel.WARNING,
				showNotice: false
			});
		}
	}

	/**
	 * Update a mapping by index
	 * @param index The index of the mapping to update
	 * @param mapping The updated mapping
	 */
	public async updateMapping(index: number, mapping: Partial<PublishMapping>): Promise<void> {
		if (index >= 0 && index < this.settings.publishMappings.length) {
			// Ensure required properties are not undefined after the update
			const currentMapping = this.settings.publishMappings[index];

			if (!currentMapping) {
				this.errorHandler.handleError({
					message: `Invalid mapping at index ${index}`,
					component: 'SettingsManager',
					level: ErrorLevel.WARNING,
					showNotice: false
				});
				return;
			}

			const updatedMapping: PublishMapping = {
				confluenceParentId: mapping.confluenceParentId ?? currentMapping.confluenceParentId,
				folderToPublish: mapping.folderToPublish ?? currentMapping.folderToPublish,
				// Ensure label is never undefined but can be empty string
				label: mapping.label !== undefined ? mapping.label : (currentMapping.label ?? '')
			};

			this.settings.publishMappings[index] = updatedMapping;
			await this.saveSettings(false);

			// Notify about mapping change
			this.eventCoordinator.publish(SettingsEvent.MAPPINGS_CHANGED, this.settings.publishMappings);
		} else {
			this.errorHandler.handleError({
				message: `Invalid mapping index: ${index}`,
				component: 'SettingsManager',
				level: ErrorLevel.WARNING,
				showNotice: false
			});
		}
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		SettingsManager.instance = undefined as unknown as SettingsManager;
	}

	/**
	 * Get legacy settings for backward compatibility
	 * @returns Object containing folderToPublish and confluenceParentId
	 */
	public getLegacySettings(): { folderToPublish: string, confluenceParentId: string } {
		return {
			folderToPublish: this.settings.folderToPublish,
			confluenceParentId: this.settings.confluenceParentId
		};
	}
} 