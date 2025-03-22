import { App, ButtonComponent, Menu, MenuItem, Modal, Notice, TFolder } from 'obsidian';
import { MappingManager } from '../mapping/MappingManager';
import { PublishMapping } from '../models/Types';
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
			// Only show for folders
			if (!file || !this.app || file.vault !== this.app.vault || !(file instanceof TFolder)) {
				return;
			}

			const folderPath = file.path;
			const isPublishRoot = this.mappingManager.isFolderPublishRoot(folderPath);
			const mappingIndex = this.mappingManager.getMappingIndexForFolder(folderPath);
			const mapping = mappingIndex >= 0 ? this.mappingManager.getPublishMappings()[mappingIndex] : null;

			this.logger.debug(`Building context menu for folder: ${folderPath}, isPublishRoot: ${isPublishRoot}`);

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

				// Remove existing menu items from submenu
				this.removeExistingMenuItems(subMenu, "Add as a Publish Root Folder");
				this.removeExistingMenuItems(subMenu, "Remove as a Publish Root Folder");
				this.removeExistingMenuItems(subMenu, "Set Active");

				// Add publish root folder option to submenu
				subMenu.addItem((subItem: MenuItem) => {
					if (!isPublishRoot) {
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
			});
		});
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