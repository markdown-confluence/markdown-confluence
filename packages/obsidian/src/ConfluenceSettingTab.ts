import { App, Setting, PluginSettingTab } from "obsidian";
import ConfluencePlugin from "./main";

export class ConfluenceSettingTab extends PluginSettingTab {
	plugin: ConfluencePlugin;

	constructor(app: App, plugin: ConfluencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", {
			text: "Settings for connecting to Atlassian Confluence",
		});

		new Setting(containerEl)
			.setName("Confluence Domain")
			.setDesc('Confluence Domain eg "https://mysite.atlassian.net"')
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
			.setDesc('eg "username@domain.com"')
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
			.setDesc("")
			.addText((text) =>
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.atlassianApiToken)
					.onChange(async (value) => {
						this.plugin.settings.atlassianApiToken = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Confluence Parent Page ID")
			.setDesc("Page ID to publish files under")
			.addText((text) =>
				text
					.setPlaceholder("23232345645")
					.setValue(this.plugin.settings.confluenceParentId)
					.onChange(async (value) => {
						this.plugin.settings.confluenceParentId = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Folder to publish")
			.setDesc(
				"Publish all files except notes that are excluded using YAML Frontmatter",
			)
			.addText((text) =>
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.folderToPublish)
					.onChange(async (value) => {
						this.plugin.settings.folderToPublish = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("First Header Page Name")
			.setDesc("First header replaces file name as page title")
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
			.setDesc("Pick the theme to apply to mermaid diagrams")
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
	}
}
