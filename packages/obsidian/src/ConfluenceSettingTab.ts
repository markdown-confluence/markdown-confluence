import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
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
					.setValue(this.plugin.settings.confluenceBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.confluenceBaseUrl = value;
						await this.plugin.saveSettings();
					}),
			);

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
					}),
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
					}),
			);

		// containerEl.createEl("hr");

		// Publishing
		containerEl.createEl("h2", { text: "Publishing" });

		// Legacy settings for backward compatibility
		if (this.plugin.settings.folderToPublish || this.plugin.settings.confluenceParentId) {
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
						.setValue(this.plugin.settings.confluenceParentId)
						.onChange(async (value) => {
							this.plugin.settings.confluenceParentId = value;
							await this.plugin.saveSettings();
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
						.setValue(this.plugin.settings.folderToPublish)
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
							this.plugin.settings.folderToPublish = value;
							await this.plugin.saveSettings();
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
			if (this.plugin.settings.folderToPublish) {
				const folderExists = this.app.vault.getAbstractFileByPath(this.plugin.settings.folderToPublish) !== null;
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

		// containerEl.createEl("hr");

		// Display
		containerEl.createEl("h2", { text: "Display" });

		new Setting(containerEl)
			.setName("Use first header as page title")
			.setDesc("When enabled, the first heading in the file will be used as the Confluence page title instead of the filename")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.firstHeadingPageTitle)
					.onChange(async (value) => {
						this.plugin.settings.firstHeadingPageTitle = value;
						await this.plugin.saveSettings();
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
					.setValue(this.plugin.settings.mermaidTheme)
					.onChange(async (value) => {
						// @ts-expect-error
						this.plugin.settings.mermaidTheme = value;
						await this.plugin.saveSettings();
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
					.setValue(String(this.plugin.settings.logLevel !== undefined ? this.plugin.settings.logLevel : LogLevel.SILENT))
					.onChange(async (value) => {
						this.plugin.settings.logLevel = parseInt(value) as LogLevel;
						await this.plugin.saveSettings();
						// Logger will be updated when settings are saved
					});
			});
	}

	renderMappings(): void {
		this.mappingsContainerEl.empty();
		console.debug("ConfluenceSettingTab: renderMappings called");

		if (this.plugin.settings.publishMappings.length === 0) {
			const emptyState = this.mappingsContainerEl.createDiv({ cls: "confluence-empty-state" });
			emptyState.createEl("p", { text: "No publish mappings defined yet. Add one to get started." });
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

			const mappingEl = this.mappingsContainerEl.createDiv({
				cls: `confluence-mapping ${isActive ? "active-mapping" : ""}`
			});

			if (isActive) {
				mappingEl.createEl("div", {
					text: "ACTIVE",
					cls: "confluence-mapping-active-badge"
				});
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
				});

			// Folder setting with validation
			let folderComponent: TextComponent;
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
							if (value && !folderExists) {
								textComponent.inputEl.addClass("is-invalid");
								folderValidationEl.setText("⚠️ This folder doesn't exist in your vault");
								folderValidationEl.show();
							} else {
								textComponent.inputEl.removeClass("is-invalid");
								folderValidationEl.hide();
							}

							mapping.folderToPublish = value;
							// Use skipInit=true to prevent settings reset
							await this.plugin.saveSettings(true);
						});

					return textComponent;
				});

			// Add validation message element
			const folderValidationEl = folderSetting.descEl.createDiv("validation-error");
			folderValidationEl.addClass("setting-item-description");
			folderValidationEl.addClass("text-error");
			folderValidationEl.style.marginTop = "8px";
			folderValidationEl.hide();

			// Validate folder on initial load
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
							const labelValue = labelComponent.getValue();
							const parentIdValue = parentIdComponent.getValue();
							const folderValue = folderComponent.getValue();

							console.debug("Current values from components:", {
								labelValue,
								parentIdValue,
								folderValue
							});

							// Update mapping values
							mapping.label = labelValue || mapping.label || "";
							mapping.confluenceParentId = parentIdValue || mapping.confluenceParentId;
							mapping.folderToPublish = folderValue || mapping.folderToPublish;

							console.debug("Updated mapping object:", {
								label: mapping.label,
								confluenceParentId: mapping.confluenceParentId,
								folderToPublish: mapping.folderToPublish
							});

							// Save the settings with updated values
							console.debug("Saving settings before setActiveMapping");
							// Use skipInit=true to prevent settings reset
							await this.plugin.saveSettings(true);

							// Now set the mapping as active
							console.debug(`Setting active mapping to index ${i}`);
							await this.plugin.setActiveMapping(i);
							console.debug("Rerendering mappings");
							this.renderMappings();
						});
				});
			}

			actionsSetting.addButton((button) => {
				button
					.setButtonText("Remove")
					.setWarning()
					.onClick(async () => {
						await this.plugin.removeMapping(i);
						this.renderMappings();
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
