import { App, Setting, PluginSettingTab } from "obsidian";
import { validateConfluenceSettings } from "@markdown-confluence/lib";
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

		const validationContainer = containerEl.createDiv({
			cls: "markdown-confluence-settings-validation",
		});
		const renderValidationResult = () => {
			validationContainer.empty();
			const validationResult = validateConfluenceSettings(this.plugin.settings);
			if (validationResult.valid) {
				return;
			}

			validationContainer.createEl("p", {
				text: "Settings need attention before publishing:",
			});
			const validationList = validationContainer.createEl("ul");
			for (const issue of validationResult.issues) {
				validationList.createEl("li", { text: issue.message });
			}
		};
		const saveSettingsAndRenderValidation = async () => {
			await this.plugin.saveSettings();
			renderValidationResult();
		};
		renderValidationResult();

		new Setting(containerEl)
			.setName("Confluence Domain")
			.setDesc('Confluence Domain eg "https://mysite.atlassian.net"')
			.addText((text) =>
				text
					.setPlaceholder("https://mysite.atlassian.net")
					.setValue(this.plugin.settings.confluenceBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.confluenceBaseUrl = value;
						await saveSettingsAndRenderValidation();
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
						await saveSettingsAndRenderValidation();
					}),
			);

		new Setting(containerEl)
			.setName("Atlassian API Token")
			.setDesc("")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("")
					.setValue(this.plugin.settings.atlassianApiToken)
					.onChange(async (value) => {
						this.plugin.settings.atlassianApiToken = value;
						await saveSettingsAndRenderValidation();
					});
			});

		new Setting(containerEl)
			.setName("Authentication Type")
			.setDesc("Use basic for Confluence Cloud API tokens or bearer for PAT-style tokens")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						basic: "Basic",
						bearer: "Bearer / PAT",
					})
					.setValue(this.plugin.settings.confluenceAuthType)
					.onChange(async (value) => {
						if (!isConfluenceAuthType(value)) {
							return;
						}

						this.plugin.settings.confluenceAuthType = value;
						await saveSettingsAndRenderValidation();
					}),
			);

		new Setting(containerEl)
			.setName("Confluence API Prefix")
			.setDesc('API route prefix eg "/wiki/rest" or "/rest"')
			.addText((text) =>
				text
					.setPlaceholder("/wiki/rest")
					.setValue(this.plugin.settings.confluenceApiPrefix)
					.onChange(async (value) => {
						this.plugin.settings.confluenceApiPrefix = value;
						await saveSettingsAndRenderValidation();
					}),
			);

		new Setting(containerEl)
			.setName("Custom Request Headers")
			.setDesc('JSON object eg {"X-Custom-Header":"value"}')
			.addTextArea((text) =>
				text
					.setPlaceholder('{"X-Custom-Header":"value"}')
					.setValue(formatRequestHeaders(this.plugin.settings.confluenceRequestHeaders))
					.onChange(async (value) => {
						const requestHeaders = parseRequestHeaders(value);
						if (!requestHeaders) {
							return;
						}

						this.plugin.settings.confluenceRequestHeaders = requestHeaders;
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
						await saveSettingsAndRenderValidation();
					}),
			);

		new Setting(containerEl)
			.setName("Folder to publish")
			.setDesc("Publish all files except notes that are excluded using YAML Frontmatter")
			.addText((text) =>
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.folderToPublish)
					.onChange(async (value) => {
						this.plugin.settings.folderToPublish = value;
						await saveSettingsAndRenderValidation();
					}),
			);

		new Setting(containerEl)
			.setName("Tags to publish")
			.setDesc("Publish files with any matching YAML tag, separated by commas")
			.addText((text) =>
				text
					.setPlaceholder("docs, public")
					.setValue(this.plugin.settings.tagsToPublish)
					.onChange(async (value) => {
						this.plugin.settings.tagsToPublish = value;
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
			.setName("Force Overwrite")
			.setDesc("Publish over pages last updated by another user")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.forceOverwrite).onChange(async (value) => {
					this.plugin.settings.forceOverwrite = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Show Publish Results Dialog")
			.setDesc("Show a dialog after publishing finishes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showPublishResultsModal)
					.onChange(async (value) => {
						this.plugin.settings.showPublishResultsModal = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Publish Dataview results")
			.setDesc(
				"Publish Dataview TABLE, LIST and TASK queries as content. Requires Dataview enabled in this vault. Ignored code block languages remain omitted; DataviewJS and inline queries are not supported.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.renderDataview).onChange(async (value) => {
					this.plugin.settings.renderDataview = value;
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

		containerEl.createEl("h2", { text: "PlantUML diagrams" });

		new Setting(containerEl)
			.setName("Enable PlantUML rendering")
			.setDesc(
				"Render fenced code blocks tagged plantuml/puml/uml as images via the PlantUML server below.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.plantuml.enabled).onChange(async (value) => {
					this.plugin.settings.plantuml.enabled = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("PlantUML server URL")
			.setDesc(
				"Rendering sends diagram source to this server. Use a server you trust, such as a local plantuml/plantuml-server container at http://localhost:8080.",
			)
			.addText((text) =>
				text
					.setPlaceholder("https://www.plantuml.com/plantuml")
					.setValue(this.plugin.settings.plantuml.serverUrl)
					.onChange(async (value) => {
						this.plugin.settings.plantuml.serverUrl = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}

function isConfluenceAuthType(value: string): value is "basic" | "bearer" {
	return value === "basic" || value === "bearer";
}

function formatRequestHeaders(headers: Record<string, string>): string {
	return Object.keys(headers).length === 0 ? "" : JSON.stringify(headers, null, 2);
}

function parseRequestHeaders(value: string): Record<string, string> | undefined {
	const trimmedValue = value.trim();
	if (!trimmedValue) {
		return {};
	}

	try {
		const headers = JSON.parse(trimmedValue) as unknown;
		if (
			headers !== null &&
			!Array.isArray(headers) &&
			typeof headers === "object" &&
			Object.values(headers).every((entry) => typeof entry === "string")
		) {
			return headers as Record<string, string>;
		}
	} catch {
		return undefined;
	}

	return undefined;
}
