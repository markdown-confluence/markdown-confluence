import { App, Setting, PluginSettingTab, Notice } from "obsidian";
import { validateConfluenceSettings } from "@markdown-confluence/lib";
import type ConfluencePlugin from "./main";

export class ConfluenceSettingTab extends PluginSettingTab {
	plugin: ConfluencePlugin;

	constructor(app: App, plugin: ConfluencePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private renderBrowserLogin(containerEl: HTMLElement) {
		const auth = this.plugin.browserOAuth;
		const disabled = auth.pending || auth.connected;
		new Setting(containerEl)
			.setName("Login method")
			.setDesc(
				"Login runs inside this plugin. Device code requires Atlassian to enable the grant for your app.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ "authorization-code": "Browser login", device: "Device code" })
					.setValue(this.plugin.settings.oauthFlow)
					.setDisabled(disabled)
					.onChange(async (value) => {
						if (value !== "authorization-code" && value !== "device") return;
						this.plugin.settings.oauthFlow = value;
						auth.status = "";
						await this.plugin.saveSettings();
						this.display();
					}),
			);
		new Setting(containerEl)
			.setName("OAuth client ID")
			.setDesc("The app registered with Atlassian for this integration.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.oauthClientId)
					.setDisabled(disabled)
					.onChange(async (value) => {
						this.plugin.settings.oauthClientId = value.trim();
						auth.status = "";
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("OAuth client secret")
			.setDesc(
				"Saved in Obsidian secret storage. Required by standard Atlassian browser apps; leave empty only for an approved public client.",
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder(
					auth.hasClientSecret ? "Secret saved" : "Enter app secret if required",
				)
					.setDisabled(disabled)
					.onChange(async (value) => {
						try {
							await auth.saveClientSecret(value);
						} catch (error) {
							new Notice(
								error instanceof Error ? error.message : "Could not save secret",
							);
						}
					});
			})
			.addButton((button) =>
				button
					.setButtonText("Clear secret")
					.setDisabled(disabled || !auth.hasClientSecret)
					.onClick(async () => {
						await auth.saveClientSecret("");
						this.display();
					}),
			);
		if (this.plugin.settings.oauthFlow === "authorization-code")
			new Setting(containerEl)
				.setName("Callback URL")
				.setDesc(
					"Register this exact URL in Atlassian. Obsidian listens on this computer only while signing in.",
				)
				.addText((text) =>
					text
						.setValue(this.plugin.settings.oauthCallbackUrl)
						.setDisabled(disabled)
						.onChange(async (value) => {
							this.plugin.settings.oauthCallbackUrl = value.trim();
							await this.plugin.saveSettings();
						}),
				);
		if (auth.deviceAuthorization) {
			new Setting(containerEl)
				.setName("Your device code")
				.setDesc(auth.deviceAuthorization.userCode)
				.addButton((button) =>
					button.setButtonText("Copy code").onClick(async () => {
						if (auth.deviceAuthorization)
							await navigator.clipboard.writeText(auth.deviceAuthorization.userCode);
					}),
				);
		}
		const status = new Setting(containerEl)
			.setName("Atlassian connection")
			.setDesc(
				auth.status ||
					(auth.connected
						? "Connected"
						: "Sign in to choose the Confluence site this vault can publish to."),
			);
		if (auth.pending) {
			status.addButton((button) =>
				button.setButtonText("Open browser").onClick(() => auth.openBrowser()),
			);
			status.addButton((button) =>
				button.setButtonText("Cancel login").onClick(() => auth.cancel()),
			);
		} else
			status.addButton((button) =>
				button
					.setButtonText(auth.connected ? "Reconnect" : "Connect to Atlassian")
					.setCta()
					.onClick(async () => {
						try {
							await auth.connect(() => this.display());
							await this.plugin.selectOAuthSite(this.plugin.settings.oauthSiteId);
							new Notice("Connected to Atlassian");
						} catch (error) {
							new Notice(error instanceof Error ? error.message : "Login failed");
						}
						this.display();
					}),
			);
		if (auth.connected && !auth.pending) {
			status.addButton((button) =>
				button.setButtonText("Disconnect").onClick(async () => {
					await auth.disconnect();
					this.display();
				}),
			);
			new Setting(containerEl)
				.setName("Confluence site")
				.setDesc("Only sites approved during login are available.")
				.addDropdown((dropdown) => {
					for (const site of this.plugin.settings.oauthSites)
						dropdown.addOption(site.id, new URL(site.url).hostname);
					dropdown.setValue(this.plugin.settings.oauthSiteId).onChange(async (value) => {
						await this.plugin.selectOAuthSite(value);
						this.display();
					});
				});
			new Setting(containerEl)
				.setName("Test connection")
				.setDesc("Check access to the configured parent page without publishing.")
				.addButton((button) =>
					button.setButtonText("Test connection").onClick(async () => {
						button.setDisabled(true);
						try {
							const client = await this.plugin.authenticationClient();
							const page = await client.content.getContentById({
								id: this.plugin.settings.confluenceParentId,
							});
							auth.status = `Connected · Parent page: ${page.title}`;
							new Notice(auth.status);
						} catch {
							auth.status =
								"Could not access the parent page. Check its ID, site and permissions.";
							new Notice(auth.status);
						}
						this.display();
					}),
				);
			containerEl.createEl("p", {
				text: "Tokens are kept in Obsidian secret storage. Disconnect removes this vault's saved login. You can revoke the app in your Atlassian account's connected apps.",
			});
		}
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
			const browser =
				this.plugin.settings.confluenceAuthType === "oauth2" &&
				this.plugin.settings.oauthMode === "browser";
			const validationResult = validateConfluenceSettings(
				browser
					? {
							...this.plugin.settings,
							confluenceAuthType: "bearer",
							atlassianApiToken: "browser-session",
						}
					: this.plugin.settings,
			);
			if (browser && !this.plugin.browserOAuth.connected)
				validationContainer.createEl("p", {
					text: "Connect to Atlassian before publishing.",
				});
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

		const oauth = this.plugin.settings.confluenceAuthType === "oauth2";
		new Setting(containerEl)
			.setName("Authentication Type")
			.setDesc("Sign in through your browser, or use an API token, PAT or service account.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						basic: "API token / Basic",
						bearer: "Bearer / PAT",
						oauth2: "OAuth / Service account",
						browser: "OAuth / Sign in",
					})
					.setValue(
						oauth && this.plugin.settings.oauthMode === "browser"
							? "browser"
							: this.plugin.settings.confluenceAuthType,
					)
					.onChange(async (value) => {
						if (value !== "browser" && !isConfluenceAuthType(value)) return;
						this.plugin.browserOAuth.cancel();
						this.plugin.settings.oauthMode =
							value === "browser" ? "browser" : "service-account";
						this.plugin.settings.confluenceAuthType =
							value === "browser" ? "oauth2" : value;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		const addText = (
			name: string,
			field:
				| "confluenceBaseUrl"
				| "confluenceSiteUrl"
				| "atlassianUserName"
				| "atlassianApiToken"
				| "atlassianClientId"
				| "atlassianClientSecret",
			description: string,
			secret = false,
		) => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(description)
				.addText((text) => {
					if (secret) text.inputEl.type = "password";
					text.setValue(this.plugin.settings[field] ?? "").onChange(async (value) => {
						this.plugin.settings[field] = value.trim();
						await saveSettingsAndRenderValidation();
					});
				});
		};
		const browser = oauth && this.plugin.settings.oauthMode === "browser";
		if (browser) this.renderBrowserLogin(containerEl);
		if (!browser)
			addText(
				"Confluence API URL",
				"confluenceBaseUrl",
				oauth
					? "https://api.atlassian.com/ex/confluence/{cloudId}"
					: "Your Confluence site. Scoped API tokens require https://api.atlassian.com/ex/confluence/{cloudId}.",
			);
		if (!browser)
			addText(
				"Confluence Site URL",
				"confluenceSiteUrl",
				"The browser address, for example https://mysite.atlassian.net. Required when using the API gateway; otherwise optional.",
			);
		if (oauth && !browser) {
			addText(
				"OAuth Client ID",
				"atlassianClientId",
				"From the service account in Atlassian Administration.",
			);
			addText(
				"OAuth Client Secret",
				"atlassianClientSecret",
				"Stored in this vault's plugin settings. A fresh access token is requested for each publish.",
				true,
			);
		} else if (!browser) {
			if (this.plugin.settings.confluenceAuthType === "basic")
				addText("Atlassian Username", "atlassianUserName", "Your Atlassian email address.");
			addText("Atlassian API Token", "atlassianApiToken", "", true);
		}

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

function isConfluenceAuthType(value: string): value is "basic" | "bearer" | "oauth2" {
	return value === "basic" || value === "bearer" || value === "oauth2";
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
