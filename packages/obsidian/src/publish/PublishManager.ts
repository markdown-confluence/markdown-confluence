/**
 * PublishManager
 * 
 * Manages the publication process for the Obsidian Confluence plugin.
 * Handles initializing the publisher, determining parent pages, and processing results.
 */

import {
	ConfluencePageConfig,
	MermaidRendererPlugin,
	Publisher,
	StaticSettingsLoader,
	UploadAdfFileResult,
} from "@markdown-confluence/lib";
import { ElectronMermaidRenderer } from "@markdown-confluence/mermaid-electron-renderer";
import { App } from "obsidian";
import { ObsidianConfluenceClient } from "../MyBaseClient";
import ObsidianAdaptor from "../adaptors/obsidian";
import { MappingManager } from "../mapping/MappingManager";
import { UploadResults } from "../models/Types";
import { SettingsManager } from "../settings/SettingsManager";
import { StateManager } from "../state/StateManager";
import { ErrorHandler, ErrorLevel } from "../utils/ErrorHandler";
import { ObsidianLoggerAdapter } from "../utils/LoggerAdapter";
import { LoggerManager } from "../utils/LoggerManager";
import { MermaidManager } from "./MermaidManager";

export class PublishManager {
	private static instance: PublishManager;
	private logger = LoggerManager.getInstance().getComponentLogger('PublishManager');
	private errorHandler = ErrorHandler.getInstance();
	private settingsManager = SettingsManager.getInstance();
	private mermaidManager = MermaidManager.getInstance();
	private mappingManager = MappingManager.getInstance();
	private stateManager = StateManager.getInstance();

	private publisher: Publisher | null = null;
	private adaptor: ObsidianAdaptor | null = null;
	private app: App | null = null;

	/**
	 * Private constructor for singleton pattern
	 */
	private constructor() { }

	/**
	 * Get the singleton instance of PublishManager
	 */
	public static getInstance(): PublishManager {
		if (!PublishManager.instance) {
			PublishManager.instance = new PublishManager();
		}
		return PublishManager.instance;
	}

	/**
	 * Initialize the PublishManager with an Obsidian App instance
	 * @param app The Obsidian App instance
	 */
	public async initialize(app: App): Promise<void> {
		this.app = app;
		const settings = this.settingsManager.getSettings();

		try {
			this.logger.info("Initializing publication system");

			// Create Obsidian adaptor
			const { vault, metadataCache } = app;
			this.adaptor = new ObsidianAdaptor(
				vault,
				metadataCache,
				settings,
				app,
			);

			// Setup Mermaid renderer
			const mermaidItems = await this.mermaidManager.getMermaidRenderingConfig();
			const mermaidRenderer = new ElectronMermaidRenderer(
				mermaidItems.extraStyleSheets,
				mermaidItems.extraStyles,
				mermaidItems.mermaidConfig,
				mermaidItems.bodyStyles,
			);

			// Setup Confluence client
			const confluenceClient = new ObsidianConfluenceClient({
				host: settings.confluenceBaseUrl,
				authentication: {
					basic: {
						email: settings.atlassianUserName,
						apiToken: settings.atlassianApiToken,
					},
				},
				middlewares: {
					onError: (e) => {
						this.logger.error(`Error in Confluence client: ${e.message}`, e);
						if ("response" in e && "data" in e.response) {
							e.message =
								typeof e.response.data === "string"
									? e.response.data
									: JSON.stringify(e.response.data);
						}
					},
				},
			});

			// Create publisher
			const settingsLoader = new StaticSettingsLoader(settings);
			const loggerAdapter = new ObsidianLoggerAdapter(this.logger);
			this.publisher = new Publisher(
				this.adaptor,
				settingsLoader,
				confluenceClient,
				[new MermaidRendererPlugin(mermaidRenderer)],
				loggerAdapter
			);

			this.logger.info("Publication system initialized successfully");
		} catch (error) {
			this.errorHandler.handleError({
				message: "Failed to initialize publication system",
				error,
				component: "PublishManager",
				level: ErrorLevel.ERROR
			});
			throw error;
		}
	}

	/**
	 * Publish content to Confluence
	 * @param publishFilter Optional path to filter what gets published
	 * @returns Upload results
	 */
	public async publish(publishFilter?: string): Promise<UploadResults> {
		return this.stateManager.withSyncingState(async () => {
			this.logger.info("Starting publication process", { publishFilter });

			try {
				// Determine parent page ID based on mappings
				if (publishFilter) {
					// If publishing a specific file, get the appropriate parent ID for that file
					const parentId = this.mappingManager.getParentIdForFile(publishFilter);
					if (parentId) {
						return await this.publishWithParentId(publishFilter, parentId);
					}
				}

				// Default case: use active mapping
				const activeMapping = this.mappingManager.getActiveMapping();
				if (activeMapping) {
					return await this.publishWithParentId(publishFilter, activeMapping.confluenceParentId);
				}

				// Fall back to legacy behavior if no mappings exist
				const settings = this.settingsManager.getSettings();
				return await this.publishWithParentId(publishFilter, settings.confluenceParentId);
			} catch (error) {
				this.logger.error("Error during publication", error);
				return {
					errorMessage: this.errorHandler.formatError(error),
					failedFiles: [],
					filesUploadResult: [],
				};
			}
		});
	}

	/**
	 * Check if the adaptor is initialized
	 */
	private ensureInitialized(): void {
		if (!this.publisher || !this.adaptor) {
			throw new Error('PublishManager not initialized. Call initialize() first.');
		}
	}

	/**
	 * Publish with a specific parent ID
	 * @param publishFilter Optional path to filter what gets published
	 * @param parentId Confluence parent page ID
	 * @returns Upload results
	 */
	private async publishWithParentId(publishFilter: string | undefined, parentId: string): Promise<UploadResults> {
		this.ensureInitialized();

		if (!this.publisher) {
			throw new Error('Publisher not initialized');
		}

		try {
			// Temporarily override the parent ID for this publish operation
			const settings = this.settingsManager.getSettings();
			const originalParentId = settings.confluenceParentId;
			await this.settingsManager.updateSettings({ confluenceParentId: parentId }, false);

			// Publish with the overridden parent ID
			const adrFiles = await this.publisher.publish(publishFilter);

			// Restore the original parent ID
			await this.settingsManager.updateSettings({ confluenceParentId: originalParentId }, false);

			// Process results
			return this.processPublishResults(adrFiles);
		} catch (error) {
			this.errorHandler.handleError({
				message: 'Error during publication with parent ID',
				error,
				component: 'PublishManager',
				level: ErrorLevel.ERROR
			});
			throw error;
		}
	}

	/**
	 * Process publish results
	 * @param adrFiles Results from the publisher
	 * @returns Formatted upload results
	 */
	private processPublishResults(adrFiles: Array<{
		successfulUploadResult?: UploadAdfFileResult;
		node: { file: { absoluteFilePath: string } };
		reason?: string;
	}>): UploadResults {
		const returnVal: UploadResults = {
			errorMessage: null,
			failedFiles: [],
			filesUploadResult: [],
		};

		adrFiles.forEach((element) => {
			if (element.successfulUploadResult) {
				returnVal.filesUploadResult.push(
					element.successfulUploadResult,
				);
				return;
			}

			returnVal.failedFiles.push({
				fileName: element.node.file.absoluteFilePath,
				reason: element.reason ?? "No Reason Provided",
			});
		});

		this.logger.info(`Publication complete. Results: ${returnVal.filesUploadResult.length} files uploaded, ${returnVal.failedFiles.length} failed`);
		return returnVal;
	}

	/**
	 * Update page-specific settings for a file
	 * @param filePath Path to the file
	 * @param settings Settings to update
	 */
	public updatePageSettings(
		filePath: string,
		settings: Partial<ConfluencePageConfig.ConfluencePerPageAllValues>
	): void {
		if (!this.adaptor) {
			this.errorHandler.handleError({
				message: 'Cannot update page settings: adaptor not initialized',
				component: 'PublishManager',
				level: ErrorLevel.ERROR
			});
			return;
		}

		try {
			this.adaptor.updateMarkdownValues(filePath, settings);
		} catch (error) {
			this.errorHandler.handleError({
				message: `Failed to update page settings for ${filePath}`,
				error,
				component: 'PublishManager',
				level: ErrorLevel.ERROR
			});
		}
	}

	/**
	 * Reset the singleton instance (useful for testing)
	 */
	public static reset(): void {
		PublishManager.instance = undefined as unknown as PublishManager;
	}
} 