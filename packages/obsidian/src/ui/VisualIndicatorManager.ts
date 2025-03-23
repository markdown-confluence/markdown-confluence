import { App, MarkdownView, Notice, setIcon } from 'obsidian';
import { MappingManager } from '../mapping/MappingManager';
import { LoggerManager } from '../utils';

/**
 * Manages visual indicators in the UI (file explorer and editor)
 */
export class VisualIndicatorManager {
	private static instance: VisualIndicatorManager;
	private app: App | null = null;
	private logger = LoggerManager.getInstance().getLogger();
	private mappingManager = MappingManager.getInstance();
	private publishIconRef: HTMLElement | null = null;

	private constructor() { }

	/**
	 * Get the singleton instance of VisualIndicatorManager
	 * @returns VisualIndicatorManager instance
	 */
	public static getInstance(): VisualIndicatorManager {
		if (!VisualIndicatorManager.instance) {
			VisualIndicatorManager.instance = new VisualIndicatorManager();
		}
		return VisualIndicatorManager.instance;
	}

	/**
	 * Reset the instance (for testing)
	 */
	public static reset(): void {
		VisualIndicatorManager.instance = new VisualIndicatorManager();
	}

	/**
	 * Initialize the manager with the app instance
	 * @param app Obsidian App instance
	 */
	public initialize(app: App): void {
		this.app = app;
		this.logger.debug('VisualIndicatorManager initialized');
	}

	/**
	 * Register event listeners for visual indicators
	 */
	public registerEvents(): void {
		if (!this.app) {
			throw new Error('VisualIndicatorManager is not initialized with an App instance');
		}

		// Register event to update visual indicators when file explorer is updated
		this.app.workspace.on('layout-change', () => {
			this.updateVisualIndicators();
		});

		// Also register event for active leaf change to update editor indicators
		this.app.workspace.on('active-leaf-change', () => {
			this.updateEditorIndicator();
		});

		// Initial update of visual indicators
		setTimeout(() => {
			this.updateVisualIndicators();
		}, 1000);
	}

	/**
	 * Get all mappings from the MappingManager
	 */
	private getAllMappings() {
		return this.mappingManager.getPublishMappings();
	}

	/**
	 * Get legacy settings from the MappingManager
	 */
	private getLegacySettings() {
		return this.mappingManager.getSettings();
	}

	/**
	 * Update visual indicators in the file explorer
	 */
	public updateVisualIndicators(): void {
		if (!this.app) {
			this.logger.debug('VisualIndicatorManager not initialized, skipping updateVisualIndicators');
			return;
		}

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
			const isPublishRoot = this.mappingManager.isFolderPublishRoot(folderPath);

			// Get active mapping
			const activeMapping = this.mappingManager.getActiveMapping();
			const isActiveRoot = activeMapping?.folderToPublish === folderPath;

			// Debug active mapping information
			if (isPublishRoot) {
				this.logger.debug(`Folder ${folderPath} is a publish root. Active: ${isActiveRoot}`);
				if (activeMapping) {
					this.logger.debug(`Active mapping: ${activeMapping.folderToPublish}, current folder: ${folderPath}`);
				} else {
					this.logger.debug('No active mapping found');
				}
			}

			// Find the mapping for this folder to get the label
			let folderLabel = '';
			if (isPublishRoot) {
				const folderMapping = this.getAllMappings().find(m => m.folderToPublish === folderPath);
				if (folderMapping && folderMapping.label) {
					folderLabel = folderMapping.label;
				}
			}

			// Remove old classes that applied styling
			folderEl.classList.remove("confluence-publish-root", "confluence-active-root");

			// Add appropriate classes to the folder element
			if (isPublishRoot) {
				folderEl.classList.add("confluence-publish-root");
				if (isActiveRoot) {
					folderEl.classList.add("confluence-active-root");
				}
			}

			// Get or create icon container
			const folderTitleContent = folderTitle.querySelector(".nav-folder-title-content");
			if (!folderTitleContent) return;

			// Remove any existing icon, label, and container
			const existingContainer = folderTitleContent.querySelector(".confluence-indicator-container");
			if (existingContainer) existingContainer.remove();

			const existingIcon = folderTitleContent.querySelector(".confluence-icon");
			if (existingIcon) existingIcon.remove();

			const existingLabel = folderTitleContent.querySelector(".confluence-label");
			if (existingLabel) existingLabel.remove();

			// Add icon for publish roots
			if (isPublishRoot) {
				// Create combined icon+label container
				const containerEl = document.createElement("span");
				containerEl.className = `confluence-indicator-container ${isActiveRoot ? 'active' : 'inactive'}`;

				// Create icon element
				const iconEl = document.createElement("span");
				iconEl.className = "confluence-icon";
				setIcon(iconEl, isActiveRoot ? "cloud-upload" : "cloud");
				containerEl.appendChild(iconEl);

				// Add label if available
				if (folderLabel) {
					const labelEl = document.createElement("span");
					labelEl.className = "confluence-label";
					labelEl.textContent = folderLabel;
					containerEl.appendChild(labelEl);
				}

				folderTitleContent.appendChild(containerEl);
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
					if (!this.app) return;
					const frontMatter = this.app.metadataCache.getCache(filePath)?.frontmatter;
					const isExcluded = frontMatter && frontMatter["connie-publish"] === false;

					// Add icon based on status
					const iconEl = document.createElement("span");

					if (isExcluded) {
						// Add different icons for excluded content based on active status
						iconEl.className = `confluence-icon excluded ${isActiveRoot ? 'active' : 'inactive'}`;
						// Use different icon for active vs inactive mapping
						setIcon(iconEl, isActiveRoot ? "circle-pause" : "circle-pause");
						fileTitleContent.appendChild(iconEl);
					} else {
						// Add different icons based on active status
						iconEl.className = `confluence-icon ${isActiveRoot ? 'active' : 'inactive'}`;
						// Use different icon for active vs inactive mapping
						setIcon(iconEl, isActiveRoot ? "check" : "circle-pause");
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

	/**
	 * Add visual indicator to editor when editing a publishable note
	 */
	public updateEditorIndicator(): void {
		if (!this.app) return;

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView || !activeView.file) return;

		const filePath = activeView.file.path;
		let isPublishable = false;

		// Check if file is in any publish folder
		const mappings = this.getAllMappings();

		for (const mapping of mappings) {
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
			// Determine if file is in active mapping
			const activeMapping = this.mappingManager.getActiveMapping();
			const isInActiveMapping = activeMapping && filePath.startsWith(activeMapping.folderToPublish);

			// Add icon for enabled publishing with active/inactive status
			this.publishIconRef = activeView.addAction(
				isInActiveMapping ? "cloud-upload" : "cloud",
				"Publishing enabled",
				() => {
					// Toggle publishing off when clicked
					if (activeView.file && this.app) {
						this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
							frontmatter["connie-publish"] = false;
						});
						new Notice("Publishing disabled for this note");
						// Update the indicator after toggling
						setTimeout(() => this.updateEditorIndicator(), 100);
					}
				});
		} else if (isExplicitlyDisabled) {
			// Determine if file is in active mapping
			const activeMapping = this.mappingManager.getActiveMapping();
			const isInActiveMapping = activeMapping && filePath.startsWith(activeMapping.folderToPublish);

			// Add appropriate icon for disabled publishing based on active/inactive status
			this.publishIconRef = activeView.addAction(
				isInActiveMapping ? "ban" : "circle-slash",
				"Publishing disabled",
				() => {
					// Toggle publishing on when clicked
					if (activeView.file && this.app) {
						this.app.fileManager.processFrontMatter(activeView.file, (frontmatter) => {
							if (activeView.file && activeView.file.path.startsWith(this.getLegacySettings().folderToPublish)) {
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