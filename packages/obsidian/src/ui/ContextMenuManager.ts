import { App, ButtonComponent, DropdownComponent, Menu, MenuItem, Modal, Notice, TFile, TFolder } from 'obsidian';
import { CompletedModal } from '../CompletedModal';
import { MappingManager } from '../mapping/MappingManager';
import { PublishMapping } from '../models/Types';
import { PublishManager } from '../publish/PublishManager';
import { SettingsManager } from '../settings/SettingsManager';
import { StateManager } from '../state/StateManager';
import { LoggerManager } from '../utils';
import { VisualIndicatorManager } from './VisualIndicatorManager';

/**
 * Manages context menu items in the file explorer
 */
export class ContextMenuManager {
	private static instance: ContextMenuManager;
	private app: App | null = null;
	private logger = LoggerManager.getInstance().getLogger();
	private mappingManager = MappingManager.getInstance();
	private publishManager = PublishManager.getInstance();
	private stateManager = StateManager.getInstance();
	private settingsManager = SettingsManager.getInstance();

	private constructor() { }

	/**
	 * Get the singleton instance of ContextMenuManager
	 * @returns ContextMenuManager instance
	 */
	public static getInstance(): ContextMenuManager {
		if (!ContextMenuManager.instance) {
			ContextMenuManager.instance = new ContextMenuManager();
		}
		return ContextMenuManager.instance;
	}

	/**
	 * Reset the instance (for testing)
	 */
	public static reset(): void {
		ContextMenuManager.instance = new ContextMenuManager();
	}

	/**
	 * Initialize the manager with the app instance
	 * @param app Obsidian App instance
	 */
	public initialize(app: App): void {
		this.app = app;
		this.logger.debug('ContextMenuManager initialized');
	}

	/**
	 * Check if a file is enabled for publishing (synchronous version)
	 * @param filePath Path to the file to check
	 * @returns true if the file is enabled for publishing
	 */
	private isFileEnabledForPublishingSync(filePath: string): boolean {
		if (!this.app) return false;

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return false;

		// Check frontmatter
		try {
			const metadata = this.app.metadataCache.getCache(filePath);
			if (metadata?.frontmatter) {
				// If explicitly set to false, it's disabled
				if (metadata.frontmatter["connie-publish"] === false) {
					return false;
				}

				// If explicitly set to true, it's enabled
				if (metadata.frontmatter["connie-publish"] === true) {
					return true;
				}
			}

			// If not explicitly set in frontmatter, check if it's in a publish root folder
			return this.mappingManager.getParentIdForFile(filePath) !== null;
		} catch (error) {
			this.logger.error(`Error checking if file is enabled for publishing: ${error}`);
			return false;
		}
	}

	/**
	 * Enable publishing for a file by setting connie-publish: true in frontmatter
	 * @param filePath Path to the file to enable
	 */
	private async enableFileForPublishing(filePath: string): Promise<void> {
		if (!this.app) return;

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		this.logger.debug(`Enabling publishing for file: ${filePath}`);

		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter["connie-publish"] = true;
			});

			new Notice(`Enabled "${file.name}" for publishing`);

			// Update visual indicators
			const visualIndicatorManager = VisualIndicatorManager.getInstance();
			visualIndicatorManager.updateVisualIndicators();

			// Force a layout refresh to ensure indicators update properly
			setTimeout(() => {
				if (this.app) {
					this.app.workspace.trigger('layout-change');
					visualIndicatorManager.updateVisualIndicators();
					this.logger.debug(`Visual indicators updated after enabling file: ${filePath}`);
				}
			}, 100);
		} catch (error) {
			this.logger.error(`Error enabling file for publishing: ${error}`);
			new Notice(`Error enabling "${file.name}" for publishing: ${error}`);
		}
	}

	/**
	 * Disable publishing for a file by setting connie-publish: false in frontmatter
	 * @param filePath Path to the file to disable
	 */
	private async disableFileForPublishing(filePath: string): Promise<void> {
		if (!this.app) return;

		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		this.logger.debug(`Disabling publishing for file: ${filePath}`);

		try {
			await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
				frontmatter["connie-publish"] = false;
			});

			new Notice(`Disabled "${file.name}" from publishing`);

			// Update visual indicators
			const visualIndicatorManager = VisualIndicatorManager.getInstance();
			visualIndicatorManager.updateVisualIndicators();

			// Force a layout refresh to ensure indicators update properly
			setTimeout(() => {
				if (this.app) {
					this.app.workspace.trigger('layout-change');
					visualIndicatorManager.updateVisualIndicators();
					this.logger.debug(`Visual indicators updated after disabling file: ${filePath}`);
				}
			}, 100);
		} catch (error) {
			this.logger.error(`Error disabling file from publishing: ${error}`);
			new Notice(`Error disabling "${file.name}" from publishing: ${error}`);
		}
	}

	/**
	 * Recursively process all markdown files in a folder
	 * @param folder The folder to process
	 * @param processor Function to process each file
	 */
	private async processFilesInFolder(folder: TFolder, processor: (file: TFile) => Promise<void>): Promise<void> {
		if (!this.app) return;

		// Process all files in the current folder
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === "md") {
				await processor(child);
			} else if (child instanceof TFolder) {
				// Recursively process subfolders
				await this.processFilesInFolder(child, processor);
			}
		}
	}

	/**
	 * Enable publishing for all markdown files in a folder
	 * @param folder The folder to enable
	 */
	private async enableFolderForPublishing(folder: TFolder): Promise<void> {
		this.logger.debug(`Enabling publishing for folder: ${folder.path}`);

		try {
			await this.processFilesInFolder(folder, async (file) => {
				await this.app?.fileManager.processFrontMatter(file, (frontmatter) => {
					frontmatter["connie-publish"] = true;
				});
			});

			new Notice(`Enabled all files in "${folder.name}" for publishing`);
		} catch (error) {
			this.logger.error(`Error enabling folder for publishing: ${error}`);
			new Notice(`Error enabling folder "${folder.name}" for publishing: ${error}`);
		}
	}

	/**
	 * Disable publishing for all markdown files in a folder
	 * @param folder The folder to disable
	 */
	private async disableFolderFromPublishing(folder: TFolder): Promise<void> {
		this.logger.debug(`Disabling publishing for folder: ${folder.path}`);

		try {
			await this.processFilesInFolder(folder, async (file) => {
				await this.app?.fileManager.processFrontMatter(file, (frontmatter) => {
					frontmatter["connie-publish"] = false;
				});
			});

			new Notice(`Disabled all files in "${folder.name}" from publishing`);
		} catch (error) {
			this.logger.error(`Error disabling folder from publishing: ${error}`);
			new Notice(`Error disabling folder "${folder.name}" from publishing: ${error}`);
		}
	}

	/**
	 * Check if a folder path is inside any existing publish root folder
	 * @param folderPath The folder path to check
	 * @returns true if the folder is nested inside another publish root folder
	 */
	private isNestedInsidePublishRoot(folderPath: string): boolean {
		const mappings = this.mappingManager.getPublishMappings();

		// Check if this folder is nested inside any existing publish root
		// This validates that: "A source folder cannot be inside another source folder"
		for (const mapping of mappings) {
			// Skip checking against itself
			if (mapping.folderToPublish === folderPath) {
				continue;
			}

			// Check if this folder is a subfolder of another publish root
			if (folderPath.startsWith(mapping.folderToPublish + '/')) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if a folder contains any existing publish root folders
	 * @param folderPath The folder path to check
	 * @returns true if the folder contains other publish root folders
	 */
	private containsPublishRoots(folderPath: string): boolean {
		const mappings = this.mappingManager.getPublishMappings();

		// Check if any publish root is nested inside this folder
		// This validates that: "Source folders cannot be nested inside each other"
		for (const mapping of mappings) {
			// Skip checking against itself
			if (mapping.folderToPublish === folderPath) {
				continue;
			}

			// Check if another publish root is a subfolder of this folder
			if (mapping.folderToPublish.startsWith(folderPath + '/')) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check for and remove existing menu items with the same title
	 * @param menu The menu to check
	 * @param title The title to look for
	 */
	private removeExistingMenuItems(menu: Menu, title: string): void {
		// @ts-ignore - Accessing private property _items for cleanup
		const items = menu['items'] || menu['_items'] || [];

		// Check all existing items
		for (let i = items.length - 1; i >= 0; i--) {
			const item = items[i];
			if (item?.titleEl?.textContent === title) {
				this.logger.debug(`Removing duplicate menu item: ${title}`);

				// Remove the item from the menu's DOM
				if (item.dom) {
					item.dom.detach();
				}

				// Remove from the items array
				items.splice(i, 1);
			}
		}
	}

	/**
	 * Register the context menu for folder items
	 */
	public registerContextMenu(): void {
		if (!this.app) {
			throw new Error('ContextMenuManager is not initialized with an App instance');
		}

		// Add folder context menu for publish mappings
		this.app.workspace.on("file-menu", (menu, file) => {
			// Only proceed if file exists and is in the current vault
			if (!file || !this.app || file.vault !== this.app.vault) {
				return;
			}

			// Remove existing Confluence menu if it exists
			this.removeExistingMenuItems(menu, "Confluence");

			// Add main Confluence menu with submenu
			menu.addItem((item) => {
				item
					.setTitle("Confluence")
					.setIcon("cloud")
					.setSection("confluence");

				// Create submenu
				// @ts-ignore - Obsidian API doesn't expose setSubmenu in types but it exists
				const subMenu = item.setSubmenu();

				// Handle folder-specific menu items
				if (file instanceof TFolder) {
					const folderPath = file.path;
					const isPublishRoot = this.mappingManager.isFolderPublishRoot(folderPath);
					const mappingIndex = this.mappingManager.getMappingIndexForFolder(folderPath);
					const mapping = mappingIndex >= 0 ? this.mappingManager.getPublishMappings()[mappingIndex] : null;

					this.logger.debug(`Building context menu for folder: ${folderPath}, isPublishRoot: ${isPublishRoot}`);

					// Remove existing menu items from submenu
					this.removeExistingMenuItems(subMenu, "Add as a Publish Root Folder");
					this.removeExistingMenuItems(subMenu, "Remove as a Publish Root Folder");
					this.removeExistingMenuItems(subMenu, "Set Active");
					this.removeExistingMenuItems(subMenu, "Enable Folder for Publishing");
					this.removeExistingMenuItems(subMenu, "Disable Folder from Publishing");

					// Add folder-specific menu items
					this.addFolderMenuItems(subMenu, file, isPublishRoot, mappingIndex, mapping || null);

					// Add Enable/Disable Folder publishing options
					// These options are separate from the publish root functionality
					subMenu.addItem((subItem: MenuItem) => {
						subItem
							.setTitle("Enable Folder for Publishing")
							.setIcon("check-circle")
							.onClick(async () => {
								this.logger.debug(`"Enable Folder for Publishing" clicked for: ${folderPath}`);
								await this.enableFolderForPublishing(file);
							});
					});

					subMenu.addItem((subItem: MenuItem) => {
						subItem
							.setTitle("Disable Folder from Publishing")
							.setIcon("x-circle")
							.onClick(async () => {
								this.logger.debug(`"Disable Folder from Publishing" clicked for: ${folderPath}`);
								await this.disableFolderFromPublishing(file);
							});
					});
				}
				// Handle file-specific menu items
				else if (file instanceof TFile && file.extension === "md") {
					const filePath = file.path;
					this.logger.debug(`Building context menu for file: ${filePath}`);

					// Remove existing menu items from submenu if they exist
					this.removeExistingMenuItems(subMenu, "Publish Current File");
					this.removeExistingMenuItems(subMenu, "Enable File for Publishing");
					this.removeExistingMenuItems(subMenu, "Disable File from Publishing");

					// Add "Publish Current File" option
					subMenu.addItem((subItem: MenuItem) => {
						subItem
							.setTitle("Publish Current File")
							.setIcon("upload-cloud")
							.onClick(async () => {
								this.logger.debug(`"Publish Current File" clicked for: ${filePath}`);

								// Check if syncing is already ongoing
								if (this.stateManager.getSyncingState()) {
									new Notice("Syncing already ongoing");
									return;
								}

								// Check if the file belongs to a publishing mapping
								const parentId = this.mappingManager.getParentIdForFile(filePath);

								if (parentId) {
									// File already belongs to a publishing mapping
									this.publishFile(filePath);
								} else {
									// File doesn't belong to a publishing mapping, show modal
									this.showFilePublishMappingModal(filePath);
								}
							});
					});

					// Check if file is enabled for publishing
					const isEnabled = this.isFileEnabledForPublishingSync(filePath);

					// Add Enable/Disable File publishing options based on current state
					if (isEnabled) {
						// File is currently enabled for publishing, show disable option
						subMenu.addItem((subItem: MenuItem) => {
							subItem
								.setTitle("Disable File from Publishing")
								.setIcon("x-circle")
								.onClick(async () => {
									this.logger.debug(`"Disable File from Publishing" clicked for: ${filePath}`);
									await this.disableFileForPublishing(filePath);
								});
						});
					} else {
						// File is currently disabled for publishing, show enable option
						subMenu.addItem((subItem: MenuItem) => {
							subItem
								.setTitle("Enable File for Publishing")
								.setIcon("check-circle")
								.onClick(async () => {
									this.logger.debug(`"Enable File for Publishing" clicked for: ${filePath}`);
									await this.enableFileForPublishing(filePath);
								});
						});
					}
				}
			});
		});
	}

	/**
	 * Add folder-specific menu items to the submenu
	 */
	private addFolderMenuItems(subMenu: Menu, file: TFolder, isPublishRoot: boolean, mappingIndex: number, mapping: PublishMapping | null): void {
		const folderPath = file.path;
		// Check if this folder is nested inside a publish root
		const isNestedInside = this.isNestedInsidePublishRoot(folderPath);

		// Add publish root folder option to submenu
		subMenu.addItem((subItem: MenuItem) => {
			if (!isPublishRoot) {
				// If folder is nested inside a publish root, don't show the "Add" option
				if (isNestedInside) {
					subItem
						.setTitle("Add as a Publish Root Folder")
						.setIcon("alert-triangle")
						.setDisabled(true);
				} else {
					// Add "Add as a Publish Root Folder" option
					subItem
						.setTitle("Add as a Publish Root Folder")
						.setIcon("plus-circle")
						.onClick(async () => {
							this.logger.debug(`"Add as a Publish Root Folder" clicked for: ${folderPath}`);

							// Validate: check if this folder is nested inside another publish root
							if (this.isNestedInsidePublishRoot(folderPath)) {
								this.logger.debug(`Validation failed: Folder is nested inside another publish root: ${folderPath}`);
								new Notice("Cannot add as publish root: Folder is nested inside another publish root");
								return;
							}

							// Validate: check if this folder contains other publish roots
							if (this.containsPublishRoots(folderPath)) {
								this.logger.debug(`Validation failed: Folder contains other publish roots: ${folderPath}`);
								new Notice("Cannot add as publish root: Folder contains other publish roots");
								return;
							}

							// Create new mapping
							const newMapping: PublishMapping = {
								folderToPublish: folderPath,
								confluenceParentId: "",
								label: file.name,
								active: true
							};

							try {
								this.logger.debug(`Opening modal to get parent ID for folder: ${folderPath}`);
								// Show prompt for Confluence Parent Page ID
								const parentId = await this.promptForParentId();
								this.logger.debug(`Modal returned parentId: ${parentId ? parentId : 'null'}`);

								if (parentId !== null) {
									newMapping.confluenceParentId = parentId;
									this.logger.debug(`Adding new mapping: ${JSON.stringify(newMapping)}`);

									// Add the mapping and get its index
									const newIndex = await this.mappingManager.addMapping(newMapping);
									this.logger.debug(`Mapping added successfully for folder: ${folderPath} at index ${newIndex}`);

									// Set this mapping as the active mapping
									await this.mappingManager.setActiveMapping(newIndex);
									this.logger.debug(`Set new mapping as the active mapping at index ${newIndex}`);

									new Notice(`Added "${file.name}" as a publish root folder and set as active`);

									// Refresh visual indicators with a small delay to ensure DOM update
									const visualIndicatorManager = VisualIndicatorManager.getInstance();
									visualIndicatorManager.updateVisualIndicators();

									// Force a layout refresh to apply CSS styles properly
									this.logger.debug(`Forcing layout refresh for folder: ${folderPath}`);
									setTimeout(() => {
										if (this.app) {
											// Trigger a layout change to force UI refresh
											this.app.workspace.trigger('layout-change');
											visualIndicatorManager.updateVisualIndicators();
											this.logger.debug(`Visual indicators updated for folder: ${folderPath}`);
										}
									}, 100);
								} else {
									this.logger.debug(`User cancelled adding publish root for folder: ${folderPath}`);
								}
							} catch (error) {
								this.logger.error(`Error adding publish root folder: ${error}`);
								new Notice(`Error adding "${file.name}" as a publish root folder: ${error}`);
							}
						});
				}
			} else {
				// Add "Remove as a Publish Root Folder" option
				subItem
					.setTitle("Remove as a Publish Root Folder")
					.setIcon("minus-circle")
					.onClick(async () => {
						this.logger.debug(`"Remove as a Publish Root Folder" clicked for: ${folderPath}`);

						// Validate: Confirm this is actually a publish root
						if (!isPublishRoot) {
							this.logger.debug(`Validation failed: Folder is not a publish root: ${folderPath}`);
							new Notice("This folder is not set as a publish root");
							return;
						}

						const mappingIndex = this.mappingManager.getMappingIndexForFolder(folderPath);
						if (mappingIndex >= 0) {
							this.logger.debug(`Removing mapping at index ${mappingIndex} for folder: ${folderPath}`);

							// Check if we should remove frontmatter when unpublishing
							const settings = this.settingsManager.getSettings();
							if (settings.removeFrontmatterOnUnpublish) {
								this.logger.debug(`Will remove frontmatter for files in folder: ${folderPath}`);
								// Get folder object
								const folder = this.app?.vault.getAbstractFileByPath(folderPath);
								if (folder instanceof TFolder) {
									try {
										this.logger.debug(`Clearing connie-publish frontmatter for all files in: ${folderPath}`);
										await this.processFilesInFolder(folder, async (file) => {
											try {
												await this.app?.fileManager.processFrontMatter(file, (frontmatter) => {
													// Remove connie-publish property from frontmatter
													if (frontmatter && "connie-publish" in frontmatter) {
														delete frontmatter["connie-publish"];
														this.logger.debug(`Removed connie-publish from ${file.path}`);
													}
													// Also remove connie-parent-id if it exists
													if (frontmatter && "connie-parent-id" in frontmatter) {
														delete frontmatter["connie-parent-id"];
														this.logger.debug(`Removed connie-parent-id from ${file.path}`);
													}
												});
											} catch (error) {
												this.logger.error(`Error clearing frontmatter for file ${file.path}: ${error}`);
											}
										});
										this.logger.debug(`Finished clearing frontmatter for files in: ${folderPath}`);
										new Notice(`Removed publishing settings from all files in "${folder.name}"`);
									} catch (error) {
										this.logger.error(`Error clearing frontmatter in folder ${folderPath}: ${error}`);
										new Notice(`Error removing publishing settings: ${error}`);
									}
								}
							}

							await this.mappingManager.removeMapping(mappingIndex);
							this.logger.debug(`Mapping removed successfully for folder: ${folderPath}`);
							new Notice(`Removed "${file.name}" as a publish root folder`);

							// Refresh visual indicators with a small delay to ensure DOM update
							const visualIndicatorManager = VisualIndicatorManager.getInstance();
							visualIndicatorManager.updateVisualIndicators();

							// Force a layout refresh to apply CSS styles properly
							this.logger.debug(`Forcing layout refresh after removing folder: ${folderPath}`);
							setTimeout(() => {
								if (this.app) {
									// Trigger a layout change to force UI refresh
									this.app.workspace.trigger('layout-change');
									visualIndicatorManager.updateVisualIndicators();
									this.logger.debug(`Visual indicators updated after removing folder: ${folderPath}`);
								}
							}, 100);
						}
					});
			}
		});

		// Only show the "Set Active" option for publish roots
		if (isPublishRoot) {
			const isCurrentlyActive = mappingIndex >= 0 && this.mappingManager.getActiveMapping()?.folderToPublish === folderPath;

			// For debugging
			this.logger.debug(`Folder "${folderPath}" active status check: isPublishRoot=${isPublishRoot}, isCurrentlyActive=${isCurrentlyActive}, mappingIndex=${mappingIndex}`);
			if (this.mappingManager.getActiveMapping()) {
				this.logger.debug(`Current active mapping: ${this.mappingManager.getActiveMapping()?.folderToPublish}`);
			}

			// Only add the "Set Active" option if this isn't already the active mapping
			if (!isCurrentlyActive) {
				subMenu.addItem((subItem: MenuItem) => {
					subItem
						.setTitle("Set Active")
						.setIcon("toggle-left")
						.onClick(async () => {
							this.logger.debug(`Setting folder "${file.name}" as active`);

							try {
								// First ensure the mapping is marked as active
								if (mapping && mapping.active === false) {
									await this.mappingManager.updateMapping(mappingIndex, {
										active: true
									});
									this.logger.debug(`Updated mapping at index ${mappingIndex} to active=true`);
								}

								// Make this mapping the active mapping
								await this.mappingManager.setActiveMapping(mappingIndex);
								this.logger.debug(`Set mapping at index ${mappingIndex} as the active mapping`);

								// Log the change
								this.logger.debug(`Folder "${file.name}" successfully set to active state`);
								new Notice(`${file.name} is now active`);

								// Refresh the file explorer view to update visual indicators
								const visualIndicatorManager = VisualIndicatorManager.getInstance();
								visualIndicatorManager.updateVisualIndicators();

								// Force a layout refresh to apply CSS styles properly
								this.logger.debug(`Forcing layout refresh after setting folder as active: ${folderPath}`);
								setTimeout(() => {
									if (this.app) {
										// Trigger a layout change to force UI refresh
										this.app.workspace.trigger('layout-change');
										visualIndicatorManager.updateVisualIndicators();
										this.logger.debug(`Visual indicators updated after setting folder as active: ${folderPath}`);
									}
								}, 100);
							} catch (error) {
								this.logger.error(`Error setting folder "${file.name}" as active: ${error}`);
								new Notice(`Error setting "${file.name}" as active: ${error}`);
							}
						});
				});
			} else {
				// This is the active mapping - show a disabled indicator
				subMenu.addItem((subItem: MenuItem) => {
					subItem
						.setTitle("Currently Active")
						.setIcon("check")
						.setDisabled(true);
				});
			}
		}
	}

	/**
	 * Show the file publish mapping modal
	 * @param filePath Path to the file to publish
	 */
	private showFilePublishMappingModal(filePath: string): void {
		if (!this.app) {
			this.logger.error('Cannot show modal: app is null');
			return;
		}

		const modal = new FilePublishMappingModal(
			this.app,
			filePath,
			(parentId) => {
				if (parentId) {
					this.publishFile(filePath, parentId);
				}
			}
		);

		modal.open();
	}

	/**
	 * Publish a file
	 * @param filePath Path to the file to publish
	 * @param parentId Optional parent page ID for files outside of mappings
	 */
	private publishFile(filePath: string, parentId?: string): void {
		// Check if the file is outside of mappings
		const file = this.app?.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) {
			const isInMapping = this.mappingManager.getParentIdForFile(filePath) !== null;

			// If file is not in any mapping, add connie-publish: true to frontmatter
			if (!isInMapping && this.app) {
				this.logger.debug(`File ${filePath} is outside mappings, adding connie-publish: true to frontmatter`);
				this.logger.debug(`Using provided parent ID: ${parentId}`);

				this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					frontmatter["connie-publish"] = true;

					// If a parent ID was provided, store it temporarily in frontmatter
					if (parentId) {
						frontmatter["connie-parent-id"] = parentId;
					}
				});

				// If a parent ID was provided, use it for this publication
				if (parentId) {
					this.logger.debug(`Publishing with explicit parent ID: ${parentId}`);
					this.publishManager.publishWithParentId(filePath, parentId)
						.then((stats) => {
							// Don't show modal unless there's an error
							if (stats.errorMessage || stats.failedFiles.length > 0) {
								if (this.app) {
									new CompletedModal(this.app, stats).open();
								}
							} else {
								new Notice(`Published file successfully`);
							}
						})
						.catch((error) => this.handlePublishError(error));
					return;
				}
			}
		}

		// Standard publish flow for files in mappings
		this.publishManager.publish(filePath)
			.then((stats) => {
				// Don't show modal unless there's an error
				if (stats.errorMessage || stats.failedFiles.length > 0) {
					if (this.app) {
						new CompletedModal(this.app, stats).open();
					}
				} else {
					new Notice(`Published file successfully`);
				}
			})
			.catch((error) => this.handlePublishError(error));
	}

	/**
	 * Handle publish error
	 * @param error The error to handle
	 */
	private handlePublishError(error: unknown): void {
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

	/**
	 * Helper method to prompt user for Confluence Parent Page ID
	 * @returns Promise with the parent ID or null if cancelled
	 */
	private async promptForParentId(): Promise<string | null> {
		if (!this.app) {
			this.logger.error('Cannot show modal: app is null');
			return null;
		}

		return new Promise((resolve) => {
			const modal = new ParentIdModal(this.app!, (result) => {
				this.logger.debug(`ParentIdModal callback received: ${result ? result : 'null'}`);
				resolve(result);
			});

			modal.open();
		});
	}
}

/**
 * Modal to select a mapping or enter a parent page ID for file publishing
 */
class FilePublishMappingModal extends Modal {
	private onSubmit: (parentId: string | null) => void;
	private mappingManager = MappingManager.getInstance();
	private selectedMappingId: string | null = null;
	private customParentId: string = "";

	constructor(app: App, _filePath: string, onSubmit: (parentId: string | null) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	override onOpen() {
		const { contentEl, titleEl } = this;
		const mappings = this.mappingManager.getPublishMappings();

		titleEl.setText("Publish to Confluence");

		const form = contentEl.createEl("form");
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const parentId = this.selectedMappingId || this.customParentId.trim();
			this.close();
			this.onSubmit(parentId.length > 0 ? parentId : null);
		});

		// Container for mapping selection
		const mappingContainer = form.createDiv("mapping-container");
		mappingContainer.createEl("label", { text: "Select a mapping:" });

		// Create dropdown using Obsidian's DropdownComponent
		const selectEl = new DropdownComponent(mappingContainer);
		selectEl.addOption("", "-- Select a mapping --");
		selectEl.addOption("custom", "Custom parent page ID");

		// Add each mapping as an option
		mappings.forEach((mapping) => {
			if (mapping.confluenceParentId && mapping.active !== false) {
				selectEl.addOption(
					mapping.confluenceParentId,
					`${mapping.label || mapping.folderToPublish} (${mapping.confluenceParentId})`
				);
			}
		});

		// Container for parent ID input (initially hidden)
		const parentIdContainer = form.createDiv("parent-id-container");
		parentIdContainer.style.display = "none";
		parentIdContainer.createEl("label", { text: "Confluence Parent Page ID:" });

		const parentIdInput = parentIdContainer.createEl("input", {
			type: "text",
			placeholder: "23232345645",
		});
		parentIdInput.style.width = "100%";
		parentIdInput.style.marginBottom = "10px";

		// Handle dropdown changes
		selectEl.onChange(value => {
			if (value === "custom") {
				parentIdContainer.style.display = "block";
				this.selectedMappingId = null;
			} else {
				parentIdContainer.style.display = "none";
				this.selectedMappingId = value;
			}
		});

		// Handle parent ID input changes
		parentIdInput.addEventListener("input", (e) => {
			// @ts-ignore - target has value property
			this.customParentId = e.target.value;
		});

		// Button container
		const buttonContainer = form.createDiv("button-container");
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "10px";
		buttonContainer.style.marginTop = "20px";

		// Cancel button
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close();
				this.onSubmit(null);
			});

		// Publish button
		new ButtonComponent(buttonContainer)
			.setButtonText("Publish")
			.setCta()
			.onClick(() => {
				const parentId = this.selectedMappingId || this.customParentId.trim();
				this.close();
				this.onSubmit(parentId.length > 0 ? parentId : null);
			});
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal to prompt for Confluence Parent Page ID
 */
class ParentIdModal extends Modal {
	private onSubmit: (result: string | null) => void;

	constructor(app: App, onSubmit: (result: string | null) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	override onOpen() {
		const { contentEl, titleEl } = this;

		titleEl.setText("Enter Confluence Parent Page ID");

		const form = contentEl.createEl("form");
		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const parentId = inputEl.value.trim();
			this.close();
			this.onSubmit(parentId);
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

		// Cancel button
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close();
				this.onSubmit(null);
			});

		// Add button
		new ButtonComponent(buttonContainer)
			.setButtonText("Add")
			.setCta()
			.onClick(() => {
				const parentId = inputEl.value.trim();
				this.close();
				this.onSubmit(parentId);
			});

		// Set focus to input
		inputEl.focus();
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
} 