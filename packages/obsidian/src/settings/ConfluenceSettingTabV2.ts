import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
import ConfluencePlugin from "../main";
import { PublishMapping } from "../models/Types";
import { LogLevel } from "../utils";
import { ErrorHandler } from "../utils/ErrorHandler";
import { SettingsManager } from "./SettingsManager";

/**
 * Settings tab for Confluence plugin that uses SettingsManager
 */
export class ConfluenceSettingTabV2 extends PluginSettingTab {
	plugin: ConfluencePlugin;
	mappingsContainerEl: HTMLElement;
	private settingsManager: SettingsManager;
	private errorHandler: ErrorHandler;

	constructor(app: App, plugin: ConfluencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.mappingsContainerEl = document.createElement('div');
		this.settingsManager = SettingsManager.getInstance();
		this.errorHandler = ErrorHandler.getInstance();
	}

	display(): void {
		const { containerEl } = this;
		const settings = this.settingsManager.getSettings();

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Confluence Integration",
		});

		// Atlassian Connection
		containerEl.createEl("h2", { text: "Connection" });

		new Setting(containerEl)
			.setName("Confluence Domain")
			.setDesc('Your Confluence domain (e.g., "https://mysite.atlassian.net")')
			.addText((text) =>
				text
					.setPlaceholder("https://mysite.atlassian.net")
					.setValue(settings.confluenceBaseUrl)
					.onChange(async (value) => {
						await this.settingsManager.updateSettings({ confluenceBaseUrl: value }, false);
					}),
			);

		new Setting(containerEl)
			.setName("Atlassian Username")
			.setDesc('Your Atlassian account email (e.g., "username@domain.com")')
			.addText((text) =>
				text
					.setPlaceholder("username@domain.com")
					.setValue(settings.atlassianUserName)
					.onChange(async (value) => {
						await this.settingsManager.updateSettings({ atlassianUserName: value }, false);
					}),
			);

		new Setting(containerEl)
			.setName("Atlassian API Token")
			.setDesc("Your Atlassian API token (kept secure in your vault)")
			.addText((text) =>
				text
					.setPlaceholder("Enter your API token")
					.setValue(settings.atlassianApiToken)
					.onChange(async (value) => {
						await this.settingsManager.updateSettings({ atlassianApiToken: value }, false);
					}),
			);

		// Publishing
		containerEl.createEl("h2", { text: "Publishing" });

		// Legacy settings for backward compatibility
		if (settings.folderToPublish || settings.confluenceParentId) {
			const legacySettingEl = containerEl.createDiv({ cls: "setting-item-legacy" });
			legacySettingEl.createEl("p", {
				text: "Legacy settings (maintained for compatibility):",
				cls: "setting-item-description"
			});

			new Setting(legacySettingEl)
				.setName("Confluence Parent Page ID")
				.setDesc("Page ID under which your content will be published")
				.addText((text) =>
					text
						.setPlaceholder("23232345645")
						.setValue(settings.confluenceParentId)
						.onChange(async (value) => {
							await this.settingsManager.updateSettings({ confluenceParentId: value }, false);
						}),
				);

			const folderSetting = new Setting(legacySettingEl)
				.setName("Folder to publish")
				.setDesc(
					"Specify the folder containing files to publish. Files can be excluded using YAML frontmatter."
				)
				.addText((text) => {
					const textComponent = text
						.setPlaceholder("my-confluence-content")
						.setValue(settings.folderToPublish)
						.onChange(async (value) => {
							// Check if folder exists
							const folderExists = this.app.vault.getAbstractFileByPath(value) !== null;

							// Update UI based on validation
							if (value && !folderExists) {
								textComponent.inputEl.addClass("is-invalid");
								folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
								folderValidationEl.show();
							} else {
								textComponent.inputEl.removeClass("is-invalid");
								folderValidationEl.hide();
							}

							// Still save the value (user might create the folder later)
							await this.settingsManager.updateSettings({ folderToPublish: value }, false);
						});

					return textComponent;
				});

			// Add validation message element
			const folderValidationEl = folderSetting.descEl.createDiv("validation-error");
			folderValidationEl.addClass("setting-item-description");
			folderValidationEl.addClass("text-error");
			folderValidationEl.style.marginTop = "8px";
			folderValidationEl.hide();

			// Validate on initial load
			if (settings.folderToPublish) {
				const folderExists = this.app.vault.getAbstractFileByPath(settings.folderToPublish) !== null;
				if (!folderExists) {
					const textComponent = folderSetting.components[0] as TextComponent;
					if (textComponent?.inputEl) {
						textComponent.inputEl.addClass("is-invalid");
						folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
						folderValidationEl.show();
					}
				}
			}
		}

		// Multi-folder mappings
		const mappingHeader = containerEl.createEl("h3", { text: "Publish Mappings" });
		mappingHeader.style.marginBottom = "0.5em";

		const mappingDescription = containerEl.createEl("p", {
			text: "Configure multiple folders to publish to different Confluence parent pages.",
			cls: "setting-item-description"
		});
		mappingDescription.style.marginBottom = "1em";

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
						try {
							const mappingCount = this.settingsManager.getPublishMappings().length;
							const newMapping: PublishMapping = {
								folderToPublish: "",
								confluenceParentId: "",
								label: `Mapping ${mappingCount + 1}`
							};
							await this.settingsManager.addMapping(newMapping);
							this.renderMappings();
						} catch (error) {
							this.errorHandler.handleError({
								message: 'Failed to add mapping',
								error,
								component: 'ConfluenceSettingTabV2'
							});
						}
					});
			});

		// Display
		containerEl.createEl("h2", { text: "Display" });

		new Setting(containerEl)
			.setName("Use first header as page title")
			.setDesc("When enabled, the first heading in the file will be used as the Confluence page title instead of the filename")
			.addToggle((toggle) =>
				toggle
					.setValue(settings.firstHeadingPageTitle)
					.onChange(async (value) => {
						await this.settingsManager.updateSettings({ firstHeadingPageTitle: value }, false);
					}),
			);

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
					.setValue(settings.mermaidTheme)
					.onChange(async (value) => {
						// @ts-expect-error
						await this.settingsManager.updateSettings({ mermaidTheme: value }, false);
					});
				/* eslint-enable @typescript-eslint/naming-convention */
			});

		// Add a footer with helpful information
		containerEl.createEl("div", {
			text: "Need help? Refer to the plugin documentation or create an issue on GitHub.",
			cls: "setting-item-description",
		});

		containerEl.createEl("br");

		// Add debug logging settings
		new Setting(containerEl)
			.setName("Developer")
			.setHeading();

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
					.setValue(String(settings.logLevel !== undefined ? settings.logLevel : LogLevel.SILENT))
					.onChange(async (value) => {
						await this.settingsManager.updateSettings({ logLevel: Number(value) as LogLevel }, true);
					});
			});

		// Add CSS for mapping containers
		this.addMappingStyles();
	}

	/**
	 * Render the list of publish mappings
	 */
	renderMappings(): void {
		if (!this.mappingsContainerEl) return;

		this.mappingsContainerEl.empty();

		const mappings = this.settingsManager.getPublishMappings();
		const activeMappingIndex = this.settingsManager.getSettings().activeMappingIndex;

		// If no mappings, show empty state
		if (mappings.length === 0) {
			const emptyEl = this.mappingsContainerEl.createDiv({ cls: "confluence-empty-state" });
			emptyEl.createEl("p", { text: "No publish mappings configured yet. Add one to get started." });
			return;
		}

		// Create a container for each mapping
		mappings.forEach((mapping, index) => {
			if (!mapping) return;

			const isActive = index === activeMappingIndex;
			const mappingEl = this.mappingsContainerEl.createDiv({ cls: `confluence-mapping ${isActive ? 'active-mapping' : ''}` });

			// Add "Active" badge if this is the active mapping
			if (isActive) {
				mappingEl.createDiv({
					text: "ACTIVE",
					cls: "confluence-mapping-active-badge"
				});
			}

			// Add heading with mapping label or index
			mappingEl.createEl("h4", {
				text: mapping.label || `Mapping ${index + 1}`,
				cls: "confluence-mapping-heading"
			});

			// Add label setting
			new Setting(mappingEl)
				.setName("Label")
				.setDesc("Friendly name for this mapping")
				.addText((text) => {
					const textComponent = text
						.setPlaceholder(`Mapping ${index + 1}`)
						.setValue(mapping.label || "")
						.onChange(async (value) => {
							try {
								await this.settingsManager.updateMapping(index, { label: value });
							} catch (error) {
								this.errorHandler.handleError({
									message: 'Failed to update mapping label',
									error,
									component: 'ConfluenceSettingTabV2'
								});
							}
						});
					return textComponent;
				});

			// Add folder setting
			const folderSetting = new Setting(mappingEl)
				.setName("Folder to publish")
				.setDesc("Specify the folder containing files to publish")
				.addText((text) => {
					const textComponent = text
						.setPlaceholder("my-confluence-content")
						.setValue(mapping.folderToPublish || "")
						.onChange(async (value) => {
							// Check if folder exists
							const folderExists = this.app.vault.getAbstractFileByPath(value) !== null;

							// Update UI based on validation
							if (value && !folderExists) {
								textComponent.inputEl.addClass("is-invalid");
								folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
								folderValidationEl.show();
							} else {
								textComponent.inputEl.removeClass("is-invalid");
								folderValidationEl.hide();
							}

							// Still save the value (user might create the folder later)
							await this.settingsManager.updateMapping(index, { folderToPublish: value });
						});
					return textComponent;
				});

			// Add validation message element
			const folderValidationEl = folderSetting.descEl.createDiv("validation-error");
			folderValidationEl.addClass("setting-item-description");
			folderValidationEl.addClass("text-error");
			folderValidationEl.style.marginTop = "8px";
			folderValidationEl.hide();

			// Validate on initial load
			if (mapping.folderToPublish) {
				const folderExists = this.app.vault.getAbstractFileByPath(mapping.folderToPublish) !== null;
				if (!folderExists) {
					const textComponent = folderSetting.components[0] as TextComponent;
					if (textComponent?.inputEl) {
						textComponent.inputEl.addClass("is-invalid");
						folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
						folderValidationEl.show();
					}
				}
			}

			// Add Confluence parent ID setting
			new Setting(mappingEl)
				.setName("Confluence Parent Page ID")
				.setDesc("Page ID under which content from this folder will be published")
				.addText((text) =>
					text
						.setPlaceholder("23232345645")
						.setValue(mapping.confluenceParentId || "")
						.onChange(async (value) => {
							await this.settingsManager.updateMapping(index, { confluenceParentId: value });
						})
				);

			// Add button container
			const buttonContainer = new Setting(mappingEl);
			buttonContainer.settingEl.addClass("confluence-mapping-buttons");

			// Add "Set Active" button
			buttonContainer.addButton((button) => {
				button
					.setButtonText("Set Active")
					.setClass(!isActive ? "mod-cta" : "")
					.setDisabled(isActive)
					.onClick(async () => {
						try {
							await this.settingsManager.setActiveMapping(index);
							this.renderMappings(); // Re-render to update UI
						} catch (error) {
							this.errorHandler.handleError({
								message: 'Failed to set active mapping',
								error,
								component: 'ConfluenceSettingTabV2'
							});
						}
					});
				return button;
			});

			// Add "Remove" button
			buttonContainer.addButton((button) => {
				button
					.setButtonText("Remove")
					.setClass("mod-warning")
					.onClick(async () => {
						try {
							await this.settingsManager.removeMapping(index);
							this.renderMappings(); // Re-render to update UI
						} catch (error) {
							this.errorHandler.handleError({
								message: 'Failed to remove mapping',
								error,
								component: 'ConfluenceSettingTabV2'
							});
						}
					});
				return button;
			});
		});
	}

	/**
	 * Add CSS styles for mapping containers
	 */
	addMappingStyles(): void {
		// Add CSS for mapping containers if not already added
		const styleId = "confluence-mapping-styles";
		if (!document.getElementById(styleId)) {
			const styleEl = document.createElement("style");
			styleEl.id = styleId;
			styleEl.textContent = `
				.confluence-mapping {
					border: 1px solid var(--background-modifier-border);
					border-radius: 5px;
					padding: 10px;
					margin-bottom: 15px;
					position: relative;
				}
				.confluence-mapping.active-mapping {
					border-color: var(--interactive-accent);
					border-width: 2px;
				}
				.confluence-mapping-active-badge {
					position: absolute;
					top: 10px;
					right: 10px;
					background-color: var(--interactive-accent);
					color: var(--text-on-accent);
					font-size: 12px;
					font-weight: bold;
					padding: 2px 6px;
					border-radius: 3px;
				}
				.confluence-mapping-heading {
					margin-top: 0;
					margin-bottom: 10px;
				}
				.confluence-empty-state {
					text-align: center;
					padding: 20px;
					color: var(--text-muted);
				}
			`;
			document.head.appendChild(styleEl);
		}
	}
} 