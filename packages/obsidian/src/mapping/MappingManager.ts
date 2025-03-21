/**
 * MappingManager
 * 
 * Manages folder-to-page mappings for the Obsidian Confluence plugin.
 * Handles determining the appropriate parent page for files.
 */

import { PublishMapping } from "../models/Types";
import { SettingsManager } from "../settings/SettingsManager";
import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { LoggerManager } from "../utils/LoggerManager";

export class MappingManager {
	private static instance: MappingManager;
	private logger = LoggerManager.getInstance().getComponentLogger('MappingManager');
	private errorHandler = ErrorHandler.getInstance();
	private settingsManager = SettingsManager.getInstance();

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() { }

	/**
	 * Get the singleton instance of MappingManager
	 */
	public static getInstance(): MappingManager {
		if (!MappingManager.instance) {
			MappingManager.instance = new MappingManager();
		}
		return MappingManager.instance;
	}

	/**
	 * Get the active mapping
	 */
	public getActiveMapping(): PublishMapping | null {
		return this.settingsManager.getActiveMapping();
	}

	/**
	 * Set the active mapping by index
	 * @param index The index of the mapping to set active
	 */
	public async setActiveMapping(index: number): Promise<void> {
		return this.settingsManager.setActiveMapping(index);
	}

	/**
	 * Get all publish mappings
	 */
	public getPublishMappings(): PublishMapping[] {
		return this.settingsManager.getPublishMappings();
	}

	/**
	 * Add a new mapping
	 * @param mapping The mapping to add
	 * @returns The index of the new mapping
	 */
	public async addMapping(mapping: PublishMapping): Promise<number> {
		// First validate that mapping object exists
		if (!mapping) {
			this.errorHandler.handleError({
				message: 'Cannot add undefined mapping',
				component: 'MappingManager',
				level: ErrorLevel.WARNING
			});
			return -1;
		}

		// Then check for undefined properties - but allow empty strings for new mappings
		if (mapping.folderToPublish === undefined || mapping.confluenceParentId === undefined) {
			this.errorHandler.handleError({
				message: 'Invalid mapping: folderToPublish and confluenceParentId cannot be undefined',
				component: 'MappingManager',
				level: ErrorLevel.WARNING
			});
			return -1;
		}

		return this.settingsManager.addMapping(mapping);
	}

	/**
	 * Remove a mapping by index
	 * @param index The index of the mapping to remove
	 */
	public async removeMapping(index: number): Promise<void> {
		return this.settingsManager.removeMapping(index);
	}

	/**
	 * Update a mapping by index
	 * @param index The index of the mapping to update
	 * @param mapping The updated mapping
	 */
	public async updateMapping(index: number, mapping: Partial<PublishMapping>): Promise<void> {
		return this.settingsManager.updateMapping(index, mapping);
	}

	/**
	 * Check if a folder is a publish root
	 * @param folderPath The folder path to check
	 * @returns Whether the folder is a publish root
	 */
	public isFolderPublishRoot(folderPath: string): boolean {
		return this.getPublishMappings().some(mapping =>
			mapping.folderToPublish === folderPath);
	}

	/**
	 * Get the mapping index for a folder
	 * @param folderPath The folder path to check
	 * @returns The index of the mapping for the folder, or -1 if not found
	 */
	public getMappingIndexForFolder(folderPath: string): number {
		return this.getPublishMappings().findIndex(mapping =>
			mapping.folderToPublish === folderPath);
	}

	/**
	 * Get the mapping for a folder
	 * @param folderPath The folder path to check
	 * @returns The mapping for the folder, or null if not found
	 */
	public getMappingForFolder(folderPath: string): PublishMapping | null {
		const index = this.getMappingIndexForFolder(folderPath);
		if (index >= 0) {
			const mapping = this.getPublishMappings()[index];
			return mapping || null;
		}
		return null;
	}

	/**
	 * Get the appropriate parent ID for a file path
	 * @param filePath The file path to check
	 * @returns The parent ID for the file, or null if not found
	 */
	public getParentIdForFile(filePath: string): string | null {
		this.logger.debug(`Getting parent ID for file: ${filePath}`);

		// First check if file is in any publish root folder
		for (const mapping of this.getPublishMappings()) {
			if (filePath.startsWith(mapping.folderToPublish)) {
				this.logger.debug(`Found mapping for file: ${mapping.folderToPublish} -> ${mapping.confluenceParentId}`);
				return mapping.confluenceParentId;
			}
		}

		// If not in any specific folder, check if it's in the active mapping's folder
		const activeMapping = this.getActiveMapping();
		if (activeMapping && filePath.startsWith(activeMapping.folderToPublish)) {
			this.logger.debug(`Using active mapping for file: ${activeMapping.folderToPublish} -> ${activeMapping.confluenceParentId}`);
			return activeMapping.confluenceParentId;
		}

		this.logger.debug('No parent ID found for file');
		return null;
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		MappingManager.instance = undefined as unknown as MappingManager;
	}

	/**
	 * Get the legacy settings (for backward compatibility)
	 * @returns Legacy settings object with folderToPublish and confluenceParentId
	 */
	public getSettings(): { folderToPublish: string; confluenceParentId: string } {
		const settings = this.settingsManager.getSettings();
		return {
			folderToPublish: settings.folderToPublish,
			confluenceParentId: settings.confluenceParentId
		};
	}
} 