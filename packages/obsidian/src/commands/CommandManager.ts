import { ConfluencePageConfig, renderADFDoc } from '@markdown-confluence/lib';
import { App, MarkdownView, Notice, Plugin } from 'obsidian';
import { CompletedModal } from '../CompletedModal';
import { ConfluencePerPageForm, mapFrontmatterToConfluencePerPageUIValues } from '../ConfluencePerPageForm';
import { ObsidianConfluenceClient } from '../MyBaseClient';
import { PublishManager } from '../publish/PublishManager';
import { StateManager } from '../state/StateManager';
import { LoggerManager } from '../utils';

/**
 * Manages command registration and execution for the plugin
 */
export class CommandManager {
	private static instance: CommandManager;
	private app: App | null = null;
	private plugin: Plugin | null = null;
	private logger = LoggerManager.getInstance().getLogger();
	private stateManager = StateManager.getInstance();
	private publishManager = PublishManager.getInstance();

	private constructor() { }

	/**
	 * Get the singleton instance of CommandManager
	 * @returns CommandManager instance
	 */
	public static getInstance(): CommandManager {
		if (!CommandManager.instance) {
			CommandManager.instance = new CommandManager();
		}
		return CommandManager.instance;
	}

	/**
	 * Reset the instance (for testing)
	 */
	public static reset(): void {
		CommandManager.instance = new CommandManager();
	}

	/**
	 * Initialize the manager with the app instance
	 * @param app Obsidian App instance
	 * @param plugin Plugin instance
	 */
	public initialize(app: App, plugin: Plugin): void {
		this.app = app;
		this.plugin = plugin;
		this.logger.debug('CommandManager initialized');
	}

	/**
	 * Register all commands for the plugin
	 */
	public registerCommands(): void {
		if (!this.app || !this.plugin) {
			throw new Error('CommandManager is not initialized with App and Plugin instances');
		}

		// Add ribbon icon
		this.plugin.addRibbonIcon("cloud", "Publish to Confluence", async () => {
			if (this.stateManager.getSyncingState()) {
				new Notice("Syncing already ongoing");
				return;
			}

			try {
				const stats = await this.publishManager.publish();
				if (this.app) {
					new CompletedModal(this.app, stats).open();
				}
			} catch (error) {
				if (this.app) {
					if (error instanceof Error) {
						new CompletedModal(this.app, {
							errorMessage: error.message,
							failedFiles: [],
							filesUploadResult: [],
						}).open();
					} else {
						new CompletedModal(this.app, {
							errorMessage: JSON.stringify(error),
							failedFiles: [],
							filesUploadResult: [],
						}).open();
					}
				}
			}
		});

		// ADF to Markdown command
		this.plugin.addCommand({
			id: "adf-to-markdown",
			name: "ADF To Markdown",
			callback: async () => {
				this.logger.debug("Starting ADF to Markdown conversion");
				const json = JSON.parse(
					'{"type":"doc","content":[{"type":"paragraph","content":[{"text":"Testing","type":"text"}]}],"version":1}',
				);
				this.logger.debug("Parsed JSON", { json });

				const settings = this.settingsManager.getSettings();
				const confluenceClient = new ObsidianConfluenceClient({
					host: settings.confluenceBaseUrl,
					authentication: {
						basic: {
							email: settings.atlassianUserName,
							apiToken: settings.atlassianApiToken,
						},
					},
				});
				const testingPage =
					await confluenceClient.content.getContentById({
						id: "9732097",
						expand: ["body.atlas_doc_format", "space"],
					});
				const adf = JSON.parse(
					testingPage.body?.atlas_doc_format?.value ||
					'{type: "doc", content:[]}',
				);
				renderADFDoc(adf);
			},
		});

		// Publish current file command
		this.plugin.addCommand({
			id: "publish-current",
			name: "Publish Current File to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this.stateManager.getSyncingState()) {
					if (!checking) {
						const activeLeafPath = this.getActiveLeafPath();

						this.publishManager.publish(activeLeafPath)
							.then((stats) => {
								if (this.app) {
									new CompletedModal(this.app, stats).open();
								}
							})
							.catch((error) => {
								if (this.app) {
									if (error instanceof Error) {
										new CompletedModal(this.app, {
											errorMessage: error.message,
											failedFiles: [],
											filesUploadResult: [],
										}).open();
									} else {
										new CompletedModal(this.app, {
											errorMessage: JSON.stringify(error),
											failedFiles: [],
											filesUploadResult: [],
										}).open();
									}
								}
							});
					}
					return true;
				}
				return true;
			},
		});

		// Publish all command
		this.plugin.addCommand({
			id: "publish-all",
			name: "Publish All to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this.stateManager.getSyncingState()) {
					if (!checking) {
						this.publishManager.publish()
							.then((stats) => {
								if (this.app) {
									new CompletedModal(this.app, stats).open();
								}
							})
							.catch((error) => {
								if (this.app) {
									if (error instanceof Error) {
										new CompletedModal(this.app, {
											errorMessage: error.message,
											failedFiles: [],
											filesUploadResult: [],
										}).open();
									} else {
										new CompletedModal(this.app, {
											errorMessage: JSON.stringify(error),
											failedFiles: [],
											filesUploadResult: [],
										}).open();
									}
								}
							});
					}
				}
				return true;
			},
		});

		// Enable publishing command
		this.plugin.addCommand({
			id: "enable-publishing",
			name: "Enable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file || !this.app) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;

					// Get legacy settings for compatibility
					const settings = this.settingsManager.getLegacySettings();

					const enabledForPublishing =
						(file.path.startsWith(settings.folderToPublish) &&
							(!frontMatter ||
								frontMatter["connie-publish"] !== false)) ||
						(frontMatter && frontMatter["connie-publish"] === true);
					return !enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(
					view.file,
					(frontmatter) => {
						if (
							view.file &&
							view.file.path.startsWith(
								this.settingsManager.getLegacySettings().folderToPublish,
							)
						) {
							delete frontmatter["connie-publish"];
						} else {
							frontmatter["connie-publish"] = true;
						}
					},
				);
				return true;
			},
		});

		// Disable publishing command
		this.plugin.addCommand({
			id: "disable-publishing",
			name: "Disable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file || !this.app) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;

					// Get legacy settings for compatibility
					const settings = this.settingsManager.getLegacySettings();

					const enabledForPublishing =
						(file.path.startsWith(settings.folderToPublish) &&
							(!frontMatter ||
								frontMatter["connie-publish"] !== false)) ||
						(frontMatter && frontMatter["connie-publish"] === true);
					return enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(
					view.file,
					(frontmatter) => {
						if (
							view.file &&
							view.file.path.startsWith(
								this.settingsManager.getLegacySettings().folderToPublish,
							)
						) {
							frontmatter["connie-publish"] = false;
						} else {
							delete frontmatter["connie-publish"];
						}
					},
				);
				return true;
			},
		});

		// Page settings command
		this.plugin.addCommand({
			id: "page-settings",
			name: "Update Confluence Page Settings",
			editorCallback: (_editor, view) => {
				if (!view.file || !this.app) {
					return false;
				}

				const frontMatter = this.app.metadataCache.getCache(
					view.file.path,
				)?.frontmatter;

				const file = view.file;

				new ConfluencePerPageForm(this.app, {
					config: ConfluencePageConfig.conniePerPageConfig,
					initialValues:
						mapFrontmatterToConfluencePerPageUIValues(frontMatter),
					onSubmit: (values, close) => {
						const valuesToSet: Record<string, unknown> = {};
						for (const propertyKey in values) {
							if (
								Object.prototype.hasOwnProperty.call(
									values,
									propertyKey,
								)
							) {
								const element = values[propertyKey as keyof typeof values];
								if (element && typeof element === 'object' && 'isSet' in element && element.isSet) {
									valuesToSet[propertyKey] = element.value;
								}
							}
						}
						if (this.adaptor) {
							this.adaptor.updateMarkdownValues(
								file.path,
								valuesToSet,
							);
						}
						close();
					},
				}).open();
				return true;
			},
		});
	}

	/**
	 * Gets the active workspace leaf path
	 * @returns The active leaf path or undefined if not found
	 */
	private getActiveLeafPath(): string | undefined {
		if (!this.app) return undefined;
		return this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path;
	}

	/**
	 * Get the Obsidian adaptor from PublishManager
	 */
	private get adaptor() {
		return this.publishManager.getAdaptor();
	}

	/**
	 * Get settings from SettingsManager
	 */
	private get settingsManager() {
		return this.publishManager.getSettingsManager();
	}
} 