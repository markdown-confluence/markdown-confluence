/**
 * Type definitions for the Obsidian Confluence plugin
 * This file centralizes all interfaces and types used across the plugin
 */

import { ConfluenceUploadSettings, UploadAdfFileResult } from "@markdown-confluence/lib";
import { LogLevel } from "../utils/Logger";

/**
 * Mapping between an Obsidian folder and a Confluence parent page
 */
export interface PublishMapping {
	/** Confluence parent page ID where content will be published */
	confluenceParentId: string;
	/** Path to the Obsidian folder containing content to publish */
	folderToPublish: string;
	/** Optional friendly name for the mapping */
	label?: string;
	/** Whether this mapping is active and should be included in publishing */
	active?: boolean;
}

/**
 * Plugin settings that extend the base Confluence settings
 */
export interface ObsidianPluginSettings
	extends ConfluenceUploadSettings.ConfluenceSettings {
	/** Theme to use for Mermaid diagrams */
	mermaidTheme:
	| "match-obsidian"
	| "light-obsidian"
	| "dark-obsidian"
	| "default"
	| "neutral"
	| "dark"
	| "forest";
	/** Minimum log level to display */
	logLevel: LogLevel;
	/** Array of folder-to-page mappings */
	publishMappings: PublishMapping[];
	/** Index of the currently active mapping in the publishMappings array */
	activeMappingIndex: number;
}

/**
 * Represents a file that failed to publish
 */
export interface FailedFile {
	/** Path to the file that failed */
	fileName: string;
	/** Reason for the failure */
	reason: string;
}

/**
 * Results from a publication operation
 */
export interface UploadResults {
	/** Error message if the operation failed completely */
	errorMessage: string | null;
	/** Array of files that failed to publish */
	failedFiles: FailedFile[];
	/** Array of successfully published files */
	filesUploadResult: UploadAdfFileResult[];
}

/**
 * UI interface for Confluence per-page settings
 */
export interface ConfluencePerPageUIValues {
	[key: string]: {
		isSet: boolean;
		value: unknown;
	};
} 