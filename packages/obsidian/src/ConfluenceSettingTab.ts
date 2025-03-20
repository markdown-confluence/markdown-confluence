import { App, ButtonComponent, Modal, Notice, PluginSettingTab, setIcon, Setting, TextComponent, TFolder } from "obsidian";
import ConfluencePlugin, { PublishMapping } from "./main";
import { LogLevel } from "./utils";

export class ConfluenceSettingTab extends PluginSettingTab {
	plugin: ConfluencePlugin;
	mappingsContainerEl: HTMLElement;

	constructor(app: App, plugin: ConfluencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.mappingsContainerEl = document.createElement('div');
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Main header with description and links
		containerEl.createEl("h1", {
			text: "Confluence Integration",
		});

		containerEl.createEl("p", {
			text: "This plugin allows you to publish Obsidian notes to Confluence. Configure your Atlassian connection and publishing options below.",
			cls: "setting-item-description"
		});

		// Add documentation links
		const linkContainer = containerEl.createDiv({ cls: "confluence-links-container" });

		const githubLink = linkContainer.createEl("a", {
			text: "GitHub",
			cls: "confluence-external-link",
			attr: {
				href: "https://github.com/markdown-confluence/markdown-confluence",
				target: "_blank",
				rel: "noopener"
			}
		});
		setIcon(githubLink, "github");

		linkContainer.createSpan({ text: " • ", cls: "confluence-link-separator" });

		const docsLink = linkContainer.createEl("a", {
			text: "Documentation",
			cls: "confluence-external-link",
			attr: {
				href: "https://markdown-confluence.github.io/",
				target: "_blank",
				rel: "noopener"
			}
		});
		setIcon(docsLink, "book-open");

		// Connection section with better description
		containerEl.createEl("h2", { text: "Connection" });

		containerEl.createEl("p", {
			text: "Your Atlassian account credentials are stored locally in your vault and used to authenticate with Confluence API.",
			cls: "setting-item-description"
		});

		new Setting(containerEl)
			.setName("Confluence Domain")
			.setDesc('Your Confluence domain (e.g., "https://mysite.atlassian.net")')
			.addText((text) =>
				text
					.setPlaceholder("https://mysite.atlassian.net")
					.setValue(this.plugin.settings.confluenceBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.confluenceBaseUrl = value;
						await this.plugin.saveSettings();
					})
			)
			.setTooltip("Enter the full URL of your Confluence instance, including https://");

		new Setting(containerEl)
			.setName("Atlassian Username")
			.setDesc('Your Atlassian account email (e.g., "username@domain.com")')
			.addText((text) =>
				text
					.setPlaceholder("username@domain.com")
					.setValue(this.plugin.settings.atlassianUserName)
					.onChange(async (value) => {
						this.plugin.settings.atlassianUserName = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Atlassian API Token")
			.setDesc("Your Atlassian API token (kept secure in your vault)")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API token")
					.setValue(this.plugin.settings.atlassianApiToken)
					.onChange(async (value) => {
						this.plugin.settings.atlassianApiToken = value;
						await this.plugin.saveSettings();
					})
			)
			.addExtraButton((button) => {
				button
					.setIcon("external-link")
					.setTooltip("Create an API token on Atlassian")
					.onClick(() => {
						window.open(
							"https://id.atlassian.com/manage-profile/security/api-tokens",
							"_blank"
						);
					});
			});

		// Publishing section with better descriptions
		containerEl.createEl("h2", { text: "Publishing" });

		// Multi-folder mappings with improved description
		containerEl.createEl("h3", { text: "Publish Mappings" });

		containerEl.createEl("p", {
			text: "Configure multiple folders to publish to different Confluence parent pages. Each mapping defines a source folder in your vault and a destination parent page in Confluence.",
			cls: "setting-item-description"
		});

		// Container for mapping list
		this.mappingsContainerEl = containerEl.createDiv({ cls: "confluence-mappings" });

		// Render the mappings
		this.renderMappings();

		// Add New Mapping button
		new Setting(containerEl)
			.setName("Add New Mapping")
			.setDesc("Add a new folder to Confluence parent page mapping")
			.addButton((button) => {
				button
					.setButtonText("Add Mapping")
					.setCta()
					.onClick(async () => {
						console.debug("ConfluenceSettingTab: Add Mapping button clicked");
						const newMapping: PublishMapping = {
							folderToPublish: "",
							confluenceParentId: "",
							label: `Mapping ${this.plugin.settings.publishMappings.length + 1}`
						};
						console.debug("ConfluenceSettingTab: Created new mapping:", newMapping);
						await this.plugin.addMapping(newMapping);
						console.debug("ConfluenceSettingTab: After adding mapping, re-rendering");
						this.renderMappings();
					});
			});

		// Display options with improved descriptions
		containerEl.createEl("h2", { text: "Display Options" });

		containerEl.createEl("p", {
			text: "Customize how your content appears in Confluence pages.",
			cls: "setting-item-description"
		});

		new Setting(containerEl)
			.setName("Use first header as page title")
			.setDesc("When enabled, the first heading in the file will be used as the Confluence page title instead of the filename")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.firstHeadingPageTitle)
					.onChange(async (value) => {
						this.plugin.settings.firstHeadingPageTitle = value;
						await this.plugin.saveSettings();
					})
			)
			.setTooltip("Recommended for better readability in Confluence");

		new Setting(containerEl)
			.setName("Mermaid Diagram Theme")
			.setDesc("Select the theme to apply to mermaid diagrams in your Confluence pages")
			.addDropdown((dropdown) => {
				/* eslint-disable @typescript-eslint/naming-convention */
				dropdown
					.addOptions({
						"match-obsidian": "Match Obsidian",
						"light-obsidian": "Obsidian Theme - Light",
						"dark-obsidian": "Obsidian Theme - Dark",
						default: "Mermaid - Default",
						neutral: "Mermaid - Neutral",
						dark: "Mermaid - Dark",
						forest: "Mermaid - Forest",
					})
					.setValue(this.plugin.settings.mermaidTheme)
					.onChange(async (value) => {
						// @ts-expect-error
						this.plugin.settings.mermaidTheme = value;
						await this.plugin.saveSettings();
					});
				/* eslint-enable @typescript-eslint/naming-convention */
			})
			.setTooltip("Choose a theme that matches your Confluence appearance");

		// Advanced options
		containerEl.createEl("h2", {
			text: "Advanced Options",
			cls: "confluence-developer-heading"
		});

		new Setting(containerEl)
			.setName("Debug Logging Level")
			.setDesc("Set the level of detail for debug logging")
			.addDropdown((dropdown) => {
				/* eslint-disable @typescript-eslint/naming-convention */
				dropdown
					.addOptions({
						"4": "Silent (No Logs)",
						"3": "Error Only",
						"2": "Warning & Error",
						"1": "Info, Warning & Error",
						"0": "All (Debug, Info, Warning & Error)",
					})
					/* eslint-enable @typescript-eslint/naming-convention */
					.setValue(String(this.plugin.settings.logLevel !== undefined ? this.plugin.settings.logLevel : LogLevel.SILENT))
					.onChange(async (value) => {
						this.plugin.settings.logLevel = parseInt(value) as LogLevel;
						await this.plugin.saveSettings();
						// Logger will be updated when settings are saved
					});
			})
			.setTooltip("Higher detail levels may impact performance");

		// Add footer with version info
		const footerEl = containerEl.createEl("div", {
			cls: "confluence-settings-footer"
		});

		footerEl.createEl("span", {
			text: `Markdown Confluence v${this.plugin.manifest.version}`,
			cls: "confluence-version-info"
		});
	}

	renderMappings(): void {
		this.mappingsContainerEl.empty();
		console.debug("ConfluenceSettingTab: renderMappings called");

		if (this.plugin.settings.publishMappings.length === 0) {
			const emptyState = this.mappingsContainerEl.createEl("div", {
				cls: "confluence-empty-state"
			});

			emptyState.createEl("p", {
				text: "No publish mappings defined yet. Add one to get started."
			});

			return;
		}

		console.debug("ConfluenceSettingTab: rendering mappings, count:", this.plugin.settings.publishMappings.length);
		for (let i = 0; i < this.plugin.settings.publishMappings.length; i++) {
			const mapping = this.plugin.settings.publishMappings[i];
			if (!mapping) continue; // Skip if mapping is undefined

			console.debug(`ConfluenceSettingTab: rendering mapping ${i}:`, {
				label: mapping.label,
				confluenceParentId: mapping.confluenceParentId,
				folderToPublish: mapping.folderToPublish
			});

			const isActive = i === this.plugin.settings.activeMappingIndex;

			const mappingEl = this.mappingsContainerEl.createEl("div", {
				cls: `confluence-mapping ${isActive ? "active-mapping" : ""}`
			});

			if (isActive) {
				const badgeEl = mappingEl.createEl("div", {
					cls: "confluence-mapping-active-badge"
				});

				badgeEl.createSpan({
					text: "ACTIVE",
				});

				setIcon(badgeEl, "check-circle");
			}

			// Mapping heading with label
			const headingEl = mappingEl.createEl("h4", {
				text: mapping.label || `Mapping ${i + 1}`,
				cls: "confluence-mapping-heading"
			});

			// Label setting
			let labelComponent: TextComponent;
			new Setting(mappingEl)
				.setName("Label")
				.setDesc("Friendly name for this mapping")
				.addText((text) => {
					labelComponent = text;
					text
						.setPlaceholder(`Mapping ${i + 1}`)
						.setValue(mapping.label || "")
						.onChange(async (value) => {
							console.debug(`ConfluenceSettingTab: label onChange for mapping ${i}:`, value);
							mapping.label = value;
							// Use skipInit=true to prevent settings reset
							await this.plugin.saveSettings(true);
							headingEl.setText(value || `Mapping ${i + 1}`);
						});
					return text;
				});

			// Parent ID setting
			let parentIdComponent: TextComponent;
			new Setting(mappingEl)
				.setName("Confluence Parent Page ID")
				.setDesc("Page ID under which content from this folder will be published")
				.addText((text) => {
					parentIdComponent = text;
					text
						.setPlaceholder("23232345645")
						.setValue(mapping.confluenceParentId)
						.onChange(async (value) => {
							console.debug(`ConfluenceSettingTab: parentId onChange for mapping ${i}:`, value);
							mapping.confluenceParentId = value;
							// Use skipInit=true to prevent settings reset
							await this.plugin.saveSettings(true);
						});

					return text;
				})
				.addExtraButton((button) => {
					button
						.setIcon("help-circle")
						.setTooltip("How to find your Confluence page ID")
						.onClick(() => {
							const notice = new Notice("", 0);
							const noticeContent = document.createElement("div");
							noticeContent.innerHTML = `
								<h4>How to find your Confluence Page ID</h4>
								<p>1. Go to your Confluence page</p>
								<p>2. Look at the URL, find the number after "pageId=" or before "view-page"</p>
								<p>3. Example: .../spaces/SPACE/pages/<strong>123456789</strong>/Page+Title</p>
								<div style="text-align:right">
									<button class="mod-cta">Dismiss</button>
								</div>
							`;
							const dismissButton = noticeContent.querySelector("button");
							dismissButton?.addEventListener("click", () => {
								notice.hide();
							});
							notice.noticeEl.replaceChildren(noticeContent);
						});
				});

			// Folder setting with validation
			let folderComponent: TextComponent | undefined;
			const folderSetting = new Setting(mappingEl)
				.setName("Folder to publish")
				.setDesc("Specify the folder containing files to publish")
				.addText((text) => {
					folderComponent = text;
					const textComponent = text
						.setPlaceholder("my-confluence-content")
						.setValue(mapping.folderToPublish)
						.onChange(async (value) => {
							console.debug(`ConfluenceSettingTab: folderToPublish onChange for mapping ${i}:`, value);
							// Check if folder exists
							const folderExists = this.app.vault.getAbstractFileByPath(value) !== null;

							// Update UI based on validation
							if (folderExists) {
								// No validation needed
							} else if (folderComponent?.inputEl) {
								folderComponent.inputEl.addClass("is-invalid");
								folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
								folderValidationEl.style.display = "block";
							}

							mapping.folderToPublish = value;
							// Use skipInit=true to prevent settings reset
							await this.plugin.saveSettings(true);
						});

					return textComponent;
				})
				.addExtraButton((button) => {
					button
						.setIcon("folder")
						.setTooltip("Browse folders")
						.onClick(() => {
							// Get all folders
							const folders: string[] = [];

							// Recursive function to get all folders
							const getFolders = (path: string = "") => {
								const file = this.app.vault.getAbstractFileByPath(path);
								if (!file) return;

								if (file instanceof TFolder) {
									for (const child of file.children) {
										if (child instanceof TFolder) { // Check if it's a folder
											folders.push(child.path);
											getFolders(child.path);
										}
									}
								}
							};

							getFolders("");

							// Create folder selector modal
							const modal = new FolderSelectorModal(this.app, folders, (selectedFolder) => {
								if (folderComponent && mapping) {
									folderComponent.setValue(selectedFolder);
									mapping.folderToPublish = selectedFolder;
									this.plugin.saveSettings(true);
								}
							});

							modal.open();
						});
				});

			// Add validation message element
			const folderValidationEl = folderSetting.descEl.createDiv("validation-error");
			folderValidationEl.addClass("setting-item-description");
			folderValidationEl.addClass("text-error");
			folderValidationEl.style.display = "none";

			// Validate folder on initial load
			if (mapping.folderToPublish) {
				const folderExists = this.app.vault.getAbstractFileByPath(mapping.folderToPublish) !== null;
				if (!folderExists) {
					const textComponent = folderComponent;
					if (textComponent?.inputEl) {
						textComponent.inputEl.addClass("is-invalid");
						folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
						folderValidationEl.style.display = "block";
					}
				}
			}

			// Action buttons
			const actionsSetting = new Setting(mappingEl);

			if (!isActive) {
				actionsSetting.addButton((button) => {
					button
						.setButtonText("Set Active")
						.setCta()
						.onClick(async () => {
							console.debug(`ConfluenceSettingTab: Set Active clicked for mapping ${i}`);
							console.debug("TextComponents before getValue:", {
								labelComponent: labelComponent ? "exists" : "undefined",
								parentIdComponent: parentIdComponent ? "exists" : "undefined",
								folderComponent: folderComponent ? "exists" : "undefined"
							});

							// Get the current values from the text components
							const labelValue = labelComponent?.getValue();
							const parentIdValue = parentIdComponent?.getValue();
							const folderValue = folderComponent?.getValue();

							console.debug("Current values from components:", {
								labelValue,
								parentIdValue,
								folderValue
							});

							// Update mapping values
							if (mapping) {
								mapping.label = labelValue || mapping.label || "";
								mapping.confluenceParentId = parentIdValue || mapping.confluenceParentId;
								mapping.folderToPublish = folderValue || mapping.folderToPublish;
							}

							console.debug("Updated mapping object:", {
								label: mapping?.label,
								confluenceParentId: mapping?.confluenceParentId,
								folderToPublish: mapping?.folderToPublish
							});

							// Save the settings with updated values
							console.debug("Saving settings before setActiveMapping");
							// Use skipInit=true to prevent settings reset
							await this.plugin.saveSettings(true);

							// Set the active mapping index directly to ensure UI updates
							this.plugin.settings.activeMappingIndex = i;

							// Now set the mapping as active (this handles any other logic)
							console.debug(`Setting active mapping to index ${i}`);
							await this.plugin.setActiveMapping(i);

							// Make sure to re-render with the updated active index
							console.debug("Rerendering mappings");
							this.renderMappings();
						});
				});
			}

			actionsSetting.addButton((button) => {
				button
					.setButtonText("Remove")
					.setIcon("trash-2")
					.setClass("confluence-delete-button")
					.onClick(async () => {
						// Create confirmation modal
						const modal = new ConfirmationModal(
							this.app,
							"Delete mapping",
							`Are you sure you want to delete the mapping "${mapping.label || `Mapping ${i + 1}`}"?`,
							async (confirmed) => {
								if (confirmed) {
									await this.plugin.removeMapping(i);
									this.renderMappings();
								}
							}
						);

						modal.open();
					});
			});
		}

		// Add CSS to style the mappings
		this.addMappingStyles();
	}

	addMappingStyles(): void {
		// Add CSS for mapping containers if not already added
		const styleId = "confluence-mapping-styles";
		if (!document.getElementById(styleId)) {
			const styleEl = document.createElement("style");
			styleEl.id = styleId;
			styleEl.textContent = `
				.confluence-links-container {
					display: flex;
					align-items: center;
					margin-bottom: 20px;
					gap: 8px;
				}
				
				.confluence-external-link {
					display: inline-flex;
					align-items: center;
					gap: 4px;
				}
				
				.confluence-link-separator {
					color: var(--text-muted);
				}
				
				.confluence-mapping {
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-m);
					padding: 16px;
					margin-bottom: 16px;
					position: relative;
					background-color: var(--background-secondary);
				}
				
				.confluence-mapping.active-mapping {
					border-color: var(--interactive-accent);
					border-width: 2px;
				}
				
				.confluence-mapping-active-badge {
					position: absolute;
					top: 12px;
					right: 12px;
					background-color: var(--interactive-accent);
					color: var(--text-on-accent);
					font-size: 12px;
					font-weight: bold;
					padding: 2px 8px;
					border-radius: var(--radius-s);
					display: flex;
					align-items: center;
					gap: 4px;
				}
				
				.confluence-mapping-heading {
					margin-top: 0;
					margin-bottom: 16px;
				}
				
				.confluence-empty-state {
					text-align: center;
					padding: 30px;
					color: var(--text-muted);
					background-color: var(--background-secondary);
					border-radius: var(--radius-m);
					margin-bottom: 16px;
				}
				
				.confluence-delete-button {
					color: var(--text-error) !important;
				}
				
				.is-invalid {
					border-color: var(--text-error) !important;
				}
				
				.text-error {
					color: var(--text-error);
				}
				
				.confluence-settings-footer {
					margin-top: 40px;
					padding-top: 16px;
					border-top: 1px solid var(--background-modifier-border);
					color: var(--text-muted);
					font-size: 12px;
				}
				
				.confluence-developer-heading {
					margin-top: 40px;
				}
			`;
			document.head.appendChild(styleEl);
		}
	}
}

// Helper modal for folder selection
class FolderSelectorModal extends Modal {
	folders: string[];
	onSelect: (folder: string) => void;

	constructor(app: App, folders: string[], onSelect: (folder: string) => void) {
		super(app);
		this.folders = folders;
		this.onSelect = onSelect;
	}

	override open() {
		super.open();
	}

	override onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: "Select a folder" });

		const folderList = contentEl.createEl("div", { cls: "confluence-folder-list" });

		// Style the folder list
		folderList.style.maxHeight = "300px";
		folderList.style.overflow = "auto";
		folderList.style.marginBottom = "16px";

		// Sort folders alphabetically
		this.folders.sort();

		for (const folder of this.folders) {
			const folderItem = folderList.createEl("div", { cls: "confluence-folder-item" });

			folderItem.createEl("span", {
				text: folder || "(Root)",
				cls: "confluence-folder-name"
			});

			// Style the folder item
			folderItem.style.padding = "8px";
			folderItem.style.cursor = "pointer";
			folderItem.style.borderRadius = "4px";
			folderItem.style.marginBottom = "4px";

			// Hover effect
			folderItem.addEventListener("mouseenter", () => {
				folderItem.style.backgroundColor = "var(--background-modifier-hover)";
			});

			folderItem.addEventListener("mouseleave", () => {
				folderItem.style.backgroundColor = "";
			});

			folderItem.addEventListener("click", () => {
				this.onSelect(folder);
				this.close();
			});
		}

		// Cancel button
		const footerEl = contentEl.createEl("div", { cls: "confluence-modal-footer" });
		footerEl.style.textAlign = "right";

		new ButtonComponent(footerEl)
			.setButtonText("Cancel")
			.onClick(() => this.close());
	}

	override close() {
		super.close();
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Confirmation modal
class ConfirmationModal extends Modal {
	title: string;
	message: string;
	onConfirm: (confirmed: boolean) => void;

	constructor(app: App, title: string, message: string, onConfirm: (confirmed: boolean) => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
	}

	override open() {
		super.open();
	}

	override onOpen() {
		const { contentEl } = this;

		contentEl.createEl("h2", { text: this.title });
		contentEl.createEl("p", { text: this.message });

		const footerEl = contentEl.createEl("div", { cls: "confluence-modal-footer" });
		footerEl.style.display = "flex";
		footerEl.style.justifyContent = "flex-end";
		footerEl.style.gap = "8px";
		footerEl.style.marginTop = "20px";

		new ButtonComponent(footerEl)
			.setButtonText("Cancel")
			.onClick(() => {
				this.onConfirm(false);
				this.close();
			});

		new ButtonComponent(footerEl)
			.setButtonText("Delete")
			.setWarning()
			.onClick(() => {
				this.onConfirm(true);
				this.close();
			});
	}

	override close() {
		super.close();
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

