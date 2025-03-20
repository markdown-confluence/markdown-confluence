import {
	ConfluencePageConfig,
	ConfluenceUploadSettings,
	MermaidRendererPlugin,
	Publisher,
	StaticSettingsLoader,
	UploadAdfFileResult,
	renderADFDoc,
} from "@markdown-confluence/lib";
import { ElectronMermaidRenderer } from "@markdown-confluence/mermaid-electron-renderer";
import { Mermaid } from "mermaid";
import {
	App,
	MarkdownView,
	MenuItem,
	Modal,
	Notice,
	Plugin,
	PluginManifest,
	TFolder,
	Workspace,
	loadMermaid,
	setIcon
} from "obsidian";
import ObsidianAdaptor from "./adaptors/obsidian";
import { CompletedModal } from "./CompletedModal";
import {
	ConfluencePerPageForm,
	ConfluencePerPageUIValues,
	mapFrontmatterToConfluencePerPageUIValues,
} from "./ConfluencePerPageForm";
import { ConfluenceSettingTab } from "./ConfluenceSettingTab";
import { ObsidianConfluenceClient } from "./MyBaseClient";
import { LogLevel, Logger } from "./utils";
import { ObsidianLoggerAdapter } from "./utils/LoggerAdapter";

export interface PublishMapping {
	confluenceParentId: string;
	folderToPublish: string;
	label?: string; // Optional friendly name for the mapping
}

export interface ObsidianPluginSettings
	extends ConfluenceUploadSettings.ConfluenceSettings {
	mermaidTheme:
	| "match-obsidian"
	| "light-obsidian"
	| "dark-obsidian"
	| "default"
	| "neutral"
	| "dark"
	| "forest";
	logLevel: LogLevel;
	publishMappings: PublishMapping[]; // Array of folder-to-page mappings
	activeMappingIndex: number; // Index of the currently active mapping
}

interface FailedFile {
	fileName: string;
	reason: string;
}

interface UploadResults {
	errorMessage: string | null;
	failedFiles: FailedFile[];
	filesUploadResult: UploadAdfFileResult[];
}

export default class ConfluencePlugin extends Plugin {
	settings!: ObsidianPluginSettings;
	private isSyncing = false;
	workspace!: Workspace;
	publisher!: Publisher;
	adaptor!: ObsidianAdaptor;
	private logger: Logger;
	private publishIconRef: HTMLElement | null = null;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		this.logger = Logger.createDefault();
	}

	activeLeafPath(workspace: Workspace): string | undefined {
		return workspace.getActiveViewOfType(MarkdownView)?.file?.path;
	}

	async init() {
		this.logger.info("Initializing Confluence plugin");
		console.debug("ConfluencePlugin.init: Starting initialization");
		try {
			// Store mappings before loadSettings to check if they change
			const mappingsBefore = this.settings?.publishMappings ? [...this.settings.publishMappings] : [];
			if (mappingsBefore.length > 0) {
				console.debug("ConfluencePlugin.init: Mappings before loadSettings:", mappingsBefore.map((m, i) => ({
					index: i,
					label: m.label,
					folderToPublish: m.folderToPublish,
					confluenceParentId: m.confluenceParentId
				})));
			}

			await this.loadSettings();

			// Check if mappings changed after loadSettings
			if (mappingsBefore.length > 0) {
				console.debug("ConfluencePlugin.init: Mappings after loadSettings:", this.settings.publishMappings.map((m, i) => ({
					index: i,
					label: m.label,
					folderToPublish: m.folderToPublish,
					confluenceParentId: m.confluenceParentId
				})));
			}

			const { vault, metadataCache, workspace } = this.app;
			this.workspace = workspace;
			this.adaptor = new ObsidianAdaptor(
				vault,
				metadataCache,
				this.settings,
				this.app,
			);

			const mermaidItems = await this.getMermaidItems();
			const mermaidRenderer = new ElectronMermaidRenderer(
				mermaidItems.extraStyleSheets,
				mermaidItems.extraStyles,
				mermaidItems.mermaidConfig,
				mermaidItems.bodyStyles,
			);
			const confluenceClient = new ObsidianConfluenceClient({
				host: this.settings.confluenceBaseUrl,
				authentication: {
					basic: {
						email: this.settings.atlassianUserName,
						apiToken: this.settings.atlassianApiToken,
					},
				},
				middlewares: {
					onError: (e) => {
						this.logger.error(`Error in plugin init: ${e.message}`, e);
						if ("response" in e && "data" in e.response) {
							e.message =
								typeof e.response.data === "string"
									? e.response.data
									: JSON.stringify(e.response.data);
						}
					},
				},
			});

			const settingsLoader = new StaticSettingsLoader(this.settings);
			const loggerAdapter = new ObsidianLoggerAdapter(this.logger);
			this.publisher = new Publisher(
				this.adaptor,
				settingsLoader,
				confluenceClient,
				[new MermaidRendererPlugin(mermaidRenderer)],
				loggerAdapter
			);

			this.logger.info("Confluence plugin initialized successfully");
		} catch (error) {
			this.logger.error("Failed to initialize Confluence plugin", error);
			throw error;
		}
	}

	async getMermaidItems() {
		this.logger.debug("Getting Mermaid items");
		const extraStyles: string[] = [];
		const extraStyleSheets: string[] = [];
		let bodyStyles = "";
		const body = document.querySelector("body") as HTMLBodyElement;

		switch (this.settings.mermaidTheme) {
			case "default":
			case "neutral":
			case "dark":
			case "forest":
				return {
					extraStyleSheets,
					extraStyles,
					mermaidConfig: { theme: this.settings.mermaidTheme },
					bodyStyles,
				};
			case "match-obsidian":
				bodyStyles = body.className;
				break;
			case "dark-obsidian":
				bodyStyles = "theme-dark";
				break;
			case "light-obsidian":
				bodyStyles = "theme-dark";
				break;
			default:
				throw new Error("Missing theme");
		}

		extraStyleSheets.push("app://obsidian.md/app.css");

		// @ts-expect-error
		const cssTheme = this.app.vault?.getConfig("cssTheme") as string;
		if (cssTheme) {
			const fileExists = await this.app.vault.adapter.exists(
				`.obsidian/themes/${cssTheme}/theme.css`,
			);
			if (fileExists) {
				const themeCss = await this.app.vault.adapter.read(
					`.obsidian/themes/${cssTheme}/theme.css`,
				);
				extraStyles.push(themeCss);
			}
		}

		const cssSnippets =
			// @ts-expect-error
			(this.app.vault?.getConfig("enabledCssSnippets") as string[]) ?? [];
		for (const snippet of cssSnippets) {
			const fileExists = await this.app.vault.adapter.exists(
				`.obsidian/snippets/${snippet}.css`,
			);
			if (fileExists) {
				const themeCss = await this.app.vault.adapter.read(
					`.obsidian/snippets/${snippet}.css`,
				);
				extraStyles.push(themeCss);
			}
		}

		return {
			extraStyleSheets,
			extraStyles,
			mermaidConfig: (
				(await loadMermaid()) as Mermaid
			).mermaidAPI.getConfig(),
			bodyStyles,
		};
	}

	async doPublish(publishFilter?: string): Promise<UploadResults> {
		this.logger.info("Starting publication process", { publishFilter });

		try {
			// Determine parent page ID based on active mapping or override for specific file
			if (publishFilter) {
				// If publishing a specific file, get the appropriate parent ID for that file
				const parentId = this.getParentIdForFile(publishFilter);
				if (parentId) {
					// Temporarily override the parent ID for this publish operation
					const originalParentId = this.settings.confluenceParentId;
					this.settings.confluenceParentId = parentId;

					// Publish with the overridden parent ID
					const adrFiles = await this.publisher.publish(publishFilter);

					// Restore the original parent ID
					this.settings.confluenceParentId = originalParentId;

					const returnVal: UploadResults = this.processPublishResults(adrFiles);
					return returnVal;
				}
			}

			// Default case: use active mapping or fall back to legacy settings
			const activeMapping = this.getActiveMapping();
			if (activeMapping) {
				// Temporarily set the parent ID to the active mapping's parent ID
				const originalParentId = this.settings.confluenceParentId;
				this.settings.confluenceParentId = activeMapping.confluenceParentId;

				// Publish with the active mapping's parent ID
				const adrFiles = await this.publisher.publish(publishFilter);

				// Restore the original parent ID
				this.settings.confluenceParentId = originalParentId;

				const returnVal: UploadResults = this.processPublishResults(adrFiles);
				return returnVal;
			}

			// Fall back to legacy behavior for backward compatibility
			const adrFiles = await this.publisher.publish(publishFilter);
			return this.processPublishResults(adrFiles);
		} catch (error) {
			this.logger.error("Error during publication", error);
			return {
				errorMessage: error instanceof Error ? error.message : JSON.stringify(error),
				failedFiles: [],
				filesUploadResult: [],
			};
		}
	}

	// Helper method to process publish results
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

	override async onload() {
		this.logger.info("Loading Confluence plugin");

		await this.init();

		// Add folder context menu for publish mappings
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				// Only show for folders
				if (!file || file.vault !== this.app.vault || !(file instanceof TFolder)) {
					return;
				}

				const folderPath = file.path;
				const isPublishRoot = this.isFolderPublishRoot(folderPath);

				// Add main Confluence menu with submenu
				menu.addItem((item) => {
					item
						.setTitle("Confluence")
						.setIcon("cloud")
						.setSection("confluence");

					// Create submenu
					// @ts-ignore - Obsidian API doesn't expose setSubmenu in types but it exists
					const subMenu = item.setSubmenu();

					// Add publish root folder option to submenu
					subMenu.addItem((subItem: MenuItem) => {
						if (!isPublishRoot) {
							// Add "Add as a Publish Root Folder" option
							subItem
								.setTitle("Add as a Publish Root Folder")
								.setIcon("plus-circle")
								.onClick(async () => {
									// Create new mapping
									const newMapping: PublishMapping = {
										folderToPublish: folderPath,
										confluenceParentId: "",
										label: file.name
									};

									// Show prompt for Confluence Parent Page ID
									const parentId = await this.promptForParentId();
									if (parentId !== null) {
										newMapping.confluenceParentId = parentId;
										await this.addMapping(newMapping);
										new Notice(`Added "${file.name}" as a publish root folder`);
									}
								});
						} else {
							// Add "Remove as a Publish Root Folder" option
							subItem
								.setTitle("Remove as a Publish Root Folder")
								.setIcon("minus-circle")
								.onClick(async () => {
									const mappingIndex = this.getMappingIndexForFolder(folderPath);
									if (mappingIndex >= 0) {
										await this.removeMapping(mappingIndex);
										new Notice(`Removed "${file.name}" as a publish root folder`);
									}
								});
						}
					});
				});
			})
		);

		// Add CSS for visual indicators
		this.addVisualIndicatorStyles();

		// Register event to update visual indicators when file explorer is updated
		// Use a more common event that will likely trigger when we want to update indicators
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.updateVisualIndicators();
			})
		);

		// Also register event for active leaf change to update editor indicators
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.updateEditorIndicator();
			})
		);

		// Initial update of visual indicators
		setTimeout(() => {
			this.updateVisualIndicators();
		}, 1000);

		this.addRibbonIcon("cloud", "Publish to Confluence", async () => {
			if (this.isSyncing) {
				new Notice("Syncing already on going");
				return;
			}
			this.isSyncing = true;
			try {
				const stats = await this.doPublish();
				new CompletedModal(this.app, {
					uploadResults: stats,
				}).open();
			} catch (error) {
				if (error instanceof Error) {
					new CompletedModal(this.app, {
						uploadResults: {
							errorMessage: error.message,
							failedFiles: [],
							filesUploadResult: [],
						},
					}).open();
				} else {
					new CompletedModal(this.app, {
						uploadResults: {
							errorMessage: JSON.stringify(error),
							failedFiles: [],
							filesUploadResult: [],
						},
					}).open();
				}
			} finally {
				this.isSyncing = false;
			}
		});

		this.addCommand({
			id: "adf-to-markdown",
			name: "ADF To Markdown",
			callback: async () => {
				this.logger.debug("Starting ADF to Markdown conversion");
				const json = JSON.parse(
					'{"type":"doc","content":[{"type":"paragraph","content":[{"text":"Testing","type":"text"}]}],"version":1}',
				);
				this.logger.debug("Parsed JSON", { json });

				const confluenceClient = new ObsidianConfluenceClient({
					host: this.settings.confluenceBaseUrl,
					authentication: {
						basic: {
							email: this.settings.atlassianUserName,
							apiToken: this.settings.atlassianApiToken,
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

		this.addCommand({
			id: "publish-current",
			name: "Publish Current File to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this.isSyncing) {
					if (!checking) {
						this.isSyncing = true;
						this.doPublish(this.activeLeafPath(this.workspace))
							.then((stats) => {
								new CompletedModal(this.app, {
									uploadResults: stats,
								}).open();
							})
							.catch((error) => {
								if (error instanceof Error) {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: error.message,
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								} else {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: JSON.stringify(error),
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								}
							})
							.finally(() => {
								this.isSyncing = false;
							});
					}
					return true;
				}
				return true;
			},
		});

		this.addCommand({
			id: "publish-all",
			name: "Publish All to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this.isSyncing) {
					if (!checking) {
						this.isSyncing = true;
						this.doPublish()
							.then((stats) => {
								new CompletedModal(this.app, {
									uploadResults: stats,
								}).open();
							})
							.catch((error) => {
								if (error instanceof Error) {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: error.message,
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								} else {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: JSON.stringify(error),
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								}
							})
							.finally(() => {
								this.isSyncing = false;
							});
					}
				}
				return true;
			},
		});

		this.addCommand({
			id: "enable-publishing",
			name: "Enable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;
					const enabledForPublishing =
						(file.path.startsWith(this.settings.folderToPublish) &&
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
								this.settings.folderToPublish,
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

		this.addCommand({
			id: "disable-publishing",
			name: "Disable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;
					const enabledForPublishing =
						(file.path.startsWith(this.settings.folderToPublish) &&
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
								this.settings.folderToPublish,
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

		this.addCommand({
			id: "page-settings",
			name: "Update Confluence Page Settings",
			editorCallback: (_editor, view) => {
				if (!view.file) {
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
						const valuesToSet: Partial<ConfluencePageConfig.ConfluencePerPageAllValues> =
							{};
						for (const propertyKey in values) {
							if (
								Object.prototype.hasOwnProperty.call(
									values,
									propertyKey,
								)
							) {
								const element =
									values[
									propertyKey as keyof ConfluencePerPageUIValues
									];
								if (element.isSet) {
									valuesToSet[
										propertyKey as keyof ConfluencePerPageUIValues
									] = element.value as never;
								}
							}
						}
						this.adaptor.updateMarkdownValues(
							file.path,
							valuesToSet,
						);
						close();
					},
				}).open();
				return true;
			},
		});

		this.addSettingTab(new ConfluenceSettingTab(this.app, this));

		this.logger.info("Confluence plugin loaded successfully");
	}

	override async onunload() {
		this.logger.info("Unloading Confluence plugin");
	}

	async loadSettings() {
		this.logger.debug("Loading plugin settings");
		console.debug("ConfluencePlugin.loadSettings: Loading settings from disk");

		// If settings already exist, store them for comparison
		const existingSettings = this.settings ? { ...this.settings } : null;
		const existingMappings = existingSettings?.publishMappings ?
			existingSettings.publishMappings.map((m, i) => ({
				index: i,
				label: m.label,
				folderToPublish: m.folderToPublish,
				confluenceParentId: m.confluenceParentId
			})) : [];

		if (existingMappings.length > 0) {
			console.debug("ConfluencePlugin.loadSettings: Existing mappings before load:", existingMappings);
		}

		// Load settings from disk
		const loadedData = await this.loadData();
		console.debug("ConfluencePlugin.loadSettings: Raw data loaded from disk:", loadedData);

		this.settings = Object.assign(
			{
				...ConfluenceUploadSettings.DEFAULT_SETTINGS,
				mermaidTheme: "match-obsidian",
				logLevel: LogLevel.SILENT,
				publishMappings: [],
				activeMappingIndex: 0,
			},
			loadedData,
		);

		// Log the merged settings
		console.debug("ConfluencePlugin.loadSettings: Settings after merging defaults:", {
			activeMappingIndex: this.settings.activeMappingIndex,
			mappingsCount: this.settings.publishMappings.length,
			mappings: this.settings.publishMappings.map((m, i) => ({
				index: i,
				label: m.label,
				folderToPublish: m.folderToPublish,
				confluenceParentId: m.confluenceParentId
			}))
		});

		// Handle backward compatibility - convert single mapping to array if needed
		if (this.settings.publishMappings.length === 0 && this.settings.folderToPublish && this.settings.confluenceParentId) {
			this.logger.info("Converting single mapping to array for backward compatibility");
			this.settings.publishMappings.push({
				folderToPublish: this.settings.folderToPublish,
				confluenceParentId: this.settings.confluenceParentId,
				label: "Default Mapping"
			});
			this.settings.activeMappingIndex = 0;
			await this.saveData(this.settings);
		}

		if (this.logger) {
			this.logger.updateOptions({
				minLevel: this.settings.logLevel as LogLevel
			});
		}
		this.logger.debug("Settings loaded successfully");
	}

	async saveSettings(skipInit: boolean = false) {
		this.logger.debug("Saving plugin settings");
		console.debug(`ConfluencePlugin.saveSettings: Saving settings, skipInit=${skipInit}`);
		console.debug("ConfluencePlugin.saveSettings: Settings before save:", JSON.stringify(this.settings, null, 2));

		// Verify publish mappings before saving
		if (this.settings.publishMappings) {
			console.debug("ConfluencePlugin.saveSettings: Verifying publish mappings before save");
			for (let i = 0; i < this.settings.publishMappings.length; i++) {
				const mapping = this.settings.publishMappings[i];
				if (mapping) {
					console.debug(`ConfluencePlugin.saveSettings: Mapping ${i}:`, {
						label: mapping.label,
						confluenceParentId: mapping.confluenceParentId,
						folderToPublish: mapping.folderToPublish
					});
				}
			}
		}

		await this.saveData(this.settings);
		console.debug("ConfluencePlugin.saveSettings: Settings saved to disk");

		// Allow skipping init() to avoid resetting the settings
		if (!skipInit) {
			console.debug("ConfluencePlugin.saveSettings: Calling init()");
			await this.init();
		} else {
			console.debug("ConfluencePlugin.saveSettings: Skipping init()");
			// Just update logger settings if needed
			if (this.logger) {
				this.logger.updateOptions({
					minLevel: this.settings.logLevel as LogLevel
				});
			}
		}

		this.logger.debug("Settings saved successfully");
	}

	// Get active mapping
	getActiveMapping(): PublishMapping | null {
		if (this.settings.publishMappings.length === 0) {
			return null;
		}

		if (this.settings.activeMappingIndex >= this.settings.publishMappings.length) {
			this.settings.activeMappingIndex = 0;
		}

		// Get the mapping and ensure we return null instead of undefined if it doesn't exist
		const mapping = this.settings.publishMappings[this.settings.activeMappingIndex];
		return mapping || null;
	}

	// Set active mapping by index
	async setActiveMapping(index: number): Promise<void> {
		console.debug(`ConfluencePlugin.setActiveMapping: Setting active mapping to index ${index}`);

		if (index >= 0 && index < this.settings.publishMappings.length) {
			const mappingBefore = this.settings.publishMappings[index];
			if (mappingBefore) {
				console.debug(`ConfluencePlugin.setActiveMapping: Mapping ${index} before activation:`, {
					label: mappingBefore.label,
					confluenceParentId: mappingBefore.confluenceParentId,
					folderToPublish: mappingBefore.folderToPublish
				});
			}

			this.settings.activeMappingIndex = index;
			console.debug("ConfluencePlugin.setActiveMapping: Active index updated, saving settings");
			// Skip init when saving settings from setActiveMapping to avoid potential reset
			await this.saveSettings(true);

			const mappingAfter = this.settings.publishMappings[index];
			if (mappingAfter) {
				console.debug(`ConfluencePlugin.setActiveMapping: Mapping ${index} after activation:`, {
					label: mappingAfter.label,
					confluenceParentId: mappingAfter.confluenceParentId,
					folderToPublish: mappingAfter.folderToPublish
				});
			}
		} else {
			console.debug(`ConfluencePlugin.setActiveMapping: Invalid index ${index}, mappings length: ${this.settings.publishMappings.length}`);
		}
	}

	// Add a new mapping
	async addMapping(mapping: PublishMapping): Promise<number> {
		if (!mapping) {
			console.debug("ConfluencePlugin.addMapping: Cannot add undefined mapping");
			return -1;
		}

		console.debug("ConfluencePlugin.addMapping: Adding new mapping:", {
			label: mapping.label,
			confluenceParentId: mapping.confluenceParentId,
			folderToPublish: mapping.folderToPublish
		});

		this.settings.publishMappings.push(mapping);
		const newIndex = this.settings.publishMappings.length - 1;
		// Skip init when saving settings from addMapping to avoid potential reset
		await this.saveSettings(true);
		console.debug(`ConfluencePlugin.addMapping: New mapping added at index ${newIndex}`);
		return newIndex;
	}

	// Remove a mapping by index
	async removeMapping(index: number): Promise<void> {
		console.debug(`ConfluencePlugin.removeMapping: Removing mapping at index ${index}`);

		if (index >= 0 && index < this.settings.publishMappings.length) {
			const mapping = this.settings.publishMappings[index];
			if (mapping) {
				console.debug(`ConfluencePlugin.removeMapping: Mapping to remove:`, {
					label: mapping.label,
					confluenceParentId: mapping.confluenceParentId,
					folderToPublish: mapping.folderToPublish
				});
			}

			this.settings.publishMappings.splice(index, 1);

			// Adjust active mapping index if needed
			if (this.settings.activeMappingIndex >= this.settings.publishMappings.length) {
				this.settings.activeMappingIndex = Math.max(0, this.settings.publishMappings.length - 1);
				console.debug(`ConfluencePlugin.removeMapping: Adjusted activeMappingIndex to ${this.settings.activeMappingIndex}`);
			}

			// Skip init when saving settings from removeMapping to avoid potential reset
			await this.saveSettings(true);
			console.debug("ConfluencePlugin.removeMapping: Mapping removed, settings saved");
		} else {
			console.debug(`ConfluencePlugin.removeMapping: Invalid index ${index}, mappings length: ${this.settings.publishMappings.length}`);
		}
	}

	// Check if a folder is a publish root
	isFolderPublishRoot(folderPath: string): boolean {
		return this.settings.publishMappings.some(mapping =>
			mapping.folderToPublish === folderPath);
	}

	// Get the mapping index for a folder
	getMappingIndexForFolder(folderPath: string): number {
		return this.settings.publishMappings.findIndex(mapping =>
			mapping.folderToPublish === folderPath);
	}

	// Get the appropriate parent ID for a file path
	getParentIdForFile(filePath: string): string | null {
		// First check if file is in any publish root folder
		for (const mapping of this.settings.publishMappings) {
			if (filePath.startsWith(mapping.folderToPublish)) {
				return mapping.confluenceParentId;
			}
		}

		// If not in any specific folder, use active mapping's parent ID
		const activeMapping = this.getActiveMapping();
		return activeMapping?.confluenceParentId || null;
	}

	// Helper method to prompt user for Confluence Parent Page ID
	async promptForParentId(): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText("Enter Confluence Parent Page ID");

			const contentEl = modal.contentEl;
			contentEl.empty();

			const form = contentEl.createEl("form");
			form.addEventListener("submit", (e) => {
				e.preventDefault();
				const parentId = inputEl.value.trim();
				modal.close();
				resolve(parentId);
			});

			const inputContainer = form.createDiv("input-container");
			inputContainer.createEl("label", { text: "Confluence Parent Page ID:" });

			const inputEl = inputContainer.createEl("input", {
				type: "text",
				placeholder: "23232345645",
			});
			inputEl.style.width = "100%";
			inputEl.style.marginBottom = "10px";

			const buttonContainer = form.createDiv("button-container");
			buttonContainer.style.display = "flex";
			buttonContainer.style.justifyContent = "flex-end";
			buttonContainer.style.gap = "10px";

			const cancelButton = buttonContainer.createEl("button", {
				text: "Cancel",
				type: "button",
			});
			cancelButton.addEventListener("click", () => {
				modal.close();
				resolve(null);
			});

			buttonContainer.createEl("button", {
				text: "Add",
				type: "submit",
				cls: "mod-cta",
			});

			modal.open();
			inputEl.focus();
		});
	}

	// Add CSS styles for visual indicators
	private addVisualIndicatorStyles(): void {
		const styleId = "confluence-visual-indicators";
		if (!document.getElementById(styleId)) {
			const css = `
				.nav-folder-title-content .confluence-icon,
				.nav-file-title-content .confluence-icon {
					margin-left: 4px;
					display: inline-flex;
					align-items: center;
				}
				.nav-folder-title-content .confluence-icon svg,
				.nav-file-title-content .confluence-icon svg {
					width: 14px;
					height: 14px;
					fill: var(--interactive-accent);
				}
				.is-active .view-header .confluence-icon {
					display: inline-flex;
					align-items: center;
					background-color: var(--interactive-accent);
					color: var(--text-on-accent);
					font-size: 12px;
					padding: 2px 6px;
					border-radius: 4px;
					margin-left: 8px;
					opacity: 0.85;
				}
				.is-active .view-header .confluence-icon svg {
					width: 14px;
					height: 14px;
					fill: var(--text-on-accent);
					margin-right: 4px;
				}
			`;

			const styleEl = document.createElement("style");
			styleEl.id = styleId;
			styleEl.textContent = css;
			document.head.appendChild(styleEl);
		}
	}

	// Update visual indicators in the file explorer
	private updateVisualIndicators(): void {
		// Get all folder elements
		const folderEls = document.querySelectorAll(".nav-folder");

		// Process each folder
		folderEls.forEach((folderEl) => {
			// Get folder path from the data attributes
			const folderTitle = folderEl.querySelector(".nav-folder-title");
			if (!folderTitle) return;

			const folderPath = folderTitle.getAttribute("data-path");
			if (!folderPath) return;

			// Check if folder is a publish root
			const isPublishRoot = this.isFolderPublishRoot(folderPath);

			// Get active mapping
			const activeMapping = this.getActiveMapping();
			const isActiveRoot = activeMapping?.folderToPublish === folderPath;

			// Remove old classes that applied styling
			folderEl.classList.remove("confluence-publish-root", "confluence-active-root");

			// Get or create icon container
			const folderTitleContent = folderTitle.querySelector(".nav-folder-title-content");
			if (!folderTitleContent) return;

			// Remove any existing icon
			const existingIcon = folderTitleContent.querySelector(".confluence-icon");
			if (existingIcon) existingIcon.remove();

			// Add icon for publish roots
			if (isPublishRoot) {
				const iconEl = document.createElement("span");
				iconEl.className = "confluence-icon";

				// Create icon element using Obsidian's icon system
				const iconName = isActiveRoot ? "cloud-upload" : "cloud-off";

				// Use setIcon from Obsidian's icon library
				setIcon(iconEl, iconName);

				folderTitleContent.appendChild(iconEl);
			}

			// Process files in this folder if it's a publish root
			if (isPublishRoot) {
				// Get all file elements within this folder (including subfolders)
				const processFileEl = (fileEl: Element) => {
					const fileTitle = fileEl.querySelector(".nav-file-title");
					if (!fileTitle) return;

					const filePath = fileTitle.getAttribute("data-path");
					if (!filePath || filePath.endsWith(".excalidraw")) return;

					// Remove old classes
					fileEl.classList.remove("confluence-publishable-note", "confluence-active-publishable-note");

					// Find or add the icon
					const fileTitleContent = fileTitle.querySelector(".nav-file-title-content");
					if (!fileTitleContent) return;

					// Remove any existing icon
					const existingIcon = fileTitleContent.querySelector(".confluence-icon");
					if (existingIcon) existingIcon.remove();

					// Check frontmatter to see if publishing is specifically disabled
					const frontMatter = this.app.metadataCache.getCache(filePath)?.frontmatter;
					const isExcluded = frontMatter && frontMatter["connie-publish"] === false;

					// Add icon if file should be published
					if (!isExcluded) {
						const iconEl = document.createElement("span");
						iconEl.className = "confluence-icon";

						// Create icon element using Obsidian's icon system
						const iconName = isActiveRoot ? "cloud-upload" : "cloud-off";

						// Use setIcon from Obsidian's icon library
						setIcon(iconEl, iconName);

						fileTitleContent.appendChild(iconEl);
					}
				};

				// Process direct files in this folder
				folderEl.querySelectorAll(":scope > .nav-folder-children > .nav-file").forEach(processFileEl);

				// Also process files in subfolders if they're part of the publish path
				const traverseFolder = (parentFolder: Element) => {
					const subfolders = parentFolder.querySelectorAll(":scope > .nav-folder-children > .nav-folder");
					subfolders.forEach(subfolder => {
						const subfolderTitle = subfolder.querySelector(".nav-folder-title");
						if (!subfolderTitle) return;

						const subfolderPath = subfolderTitle.getAttribute("data-path");
						if (!subfolderPath) return;

						// Process files in this subfolder
						subfolder.querySelectorAll(":scope > .nav-folder-children > .nav-file").forEach(processFileEl);

						// Recursively process deeper subfolders
						traverseFolder(subfolder);
					});
				};

				traverseFolder(folderEl);
			}
		});

		// Update editor view indicator
		this.updateEditorIndicator();
	}

	// Add visual indicator to editor when editing a publishable note
	private updateEditorIndicator(): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) return;

		const filePath = activeView.file.path;
		let isPublishable = false;

		// Check if file is in any publish folder
		for (const mapping of this.settings.publishMappings) {
			if (filePath.startsWith(mapping.folderToPublish)) {
				// Check frontmatter to see if publishing is specifically disabled
				const frontMatter = this.app.metadataCache.getCache(filePath)?.frontmatter;
				if (!frontMatter || frontMatter["connie-publish"] !== false) {
					isPublishable = true;
					break;
				}
			}
		}

		// Also check for explicit connie-publish:true in frontmatter
		if (!isPublishable) {
			const frontMatter = this.app.metadataCache.getCache(filePath)?.frontmatter;
			if (frontMatter && frontMatter["connie-publish"] === true) {
				isPublishable = true;
			}
		}

		// Get explicit connie-publish:false in frontmatter
		const isExplicitlyDisabled = this.app.metadataCache.getCache(filePath)?.frontmatter?.["connie-publish"] === false;

		// Remove existing icon if any
		if (this.publishIconRef) {
			this.publishIconRef.remove();
			this.publishIconRef = null;
		}

		// Add appropriate icon based on publish status
		if (isPublishable) {
			// Add cloud-upload icon for enabled publishing
			this.publishIconRef = activeView.addAction("cloud-upload", "Publishing enabled", () => {
				// Toggle publishing off when clicked
				if (activeView.file) {
					this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
						frontmatter["connie-publish"] = false;
					});
					new Notice("Publishing disabled for this note");
					// Update the indicator after toggling
					setTimeout(() => this.updateEditorIndicator(), 100);
				}
			});
		} else if (isExplicitlyDisabled) {
			// Add cloud-off icon for disabled publishing
			this.publishIconRef = activeView.addAction("cloud-off", "Publishing disabled", () => {
				// Toggle publishing on when clicked
				if (activeView.file) {
					this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
						if (activeView.file && activeView.file.path.startsWith(this.settings.folderToPublish)) {
							delete frontmatter["connie-publish"];
						} else {
							frontmatter["connie-publish"] = true;
						}
					});
					new Notice("Publishing enabled for this note");
					// Update the indicator after toggling
					setTimeout(() => this.updateEditorIndicator(), 100);
				}
			});
		}
	}
}
