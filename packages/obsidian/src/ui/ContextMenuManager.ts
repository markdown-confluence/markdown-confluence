import { App, MenuItem, Notice, TFolder } from 'obsidian';
import { MappingManager } from '../mapping/MappingManager';
import { PublishMapping } from '../models/Types';
import { LoggerManager } from '../utils';

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
								// Validate: check if this folder is nested inside another publish root
								if (this.isNestedInsidePublishRoot(folderPath)) {
									new Notice("Cannot add as publish root: Folder is nested inside another publish root");
									return;
								}

								// Validate: check if this folder contains other publish roots
								if (this.containsPublishRoots(folderPath)) {
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

								// Show prompt for Confluence Parent Page ID
								const parentId = await this.promptForParentId();
								if (parentId !== null) {
									newMapping.confluenceParentId = parentId;
									await this.mappingManager.addMapping(newMapping);
									new Notice(`Added "${file.name}" as a publish root folder`);
								}
							});
					} else {
						// Add "Remove as a Publish Root Folder" option
						subItem
							.setTitle("Remove as a Publish Root Folder")
							.setIcon("minus-circle")
							.onClick(async () => {
								// Validate: Confirm this is actually a publish root
								if (!isPublishRoot) {
									new Notice("This folder is not set as a publish root");
									return;
								}

								const mappingIndex = this.mappingManager.getMappingIndexForFolder(folderPath);
								if (mappingIndex >= 0) {
									await this.mappingManager.removeMapping(mappingIndex);
									new Notice(`Removed "${file.name}" as a publish root folder`);
								}
							});
					}
				});

				// Only show the toggle active/inactive option if this is a publish root
				if (isPublishRoot && mapping) {
					subMenu.addItem((subItem: MenuItem) => {
						const isActive = mapping.active !== false; // Default to true if undefined

						subItem
							.setTitle(isActive ? "Set Inactive" : "Set Active")
							.setIcon(isActive ? "toggle-right" : "toggle-left")
							.onClick(async () => {
								// Toggle the active state
								await this.mappingManager.updateMapping(mappingIndex, {
									active: !isActive
								});
								new Notice(`${file.name} is now ${!isActive ? "active" : "inactive"}`);
							});
					});
				}
			});
		});
	}

	/**
	 * Helper method to prompt user for Confluence Parent Page ID
	 * @returns Promise with the parent ID or null if cancelled
	 */
	private async promptForParentId(): Promise<string | null> {
		return new Promise((resolve) => {
			if (!this.app) {
				resolve(null);
				return;
			}

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
}

// Define the Modal class since it's not directly exported from Obsidian
class Modal {
	titleEl: HTMLElement;
	contentEl: HTMLElement;

	constructor(public app: App) {
		this.titleEl = document.createElement('div');
		this.contentEl = document.createElement('div');
	}

	open(): void {
		// Implementation not needed for type definition
	}

	close(): void {
		// Implementation not needed for type definition
	}
} 