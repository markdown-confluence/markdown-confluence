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
								const mappingIndex = this.mappingManager.getMappingIndexForFolder(folderPath);
								if (mappingIndex >= 0) {
									await this.mappingManager.removeMapping(mappingIndex);
									new Notice(`Removed "${file.name}" as a publish root folder`);
								}
							});
					}
				});
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