import { Plugin, Notice, Editor, MarkdownView } from "obsidian";
import { MainSettingTab } from "./MainSettingTab";
import { DEFAULT_SETTINGS, MyPluginSettings } from "./Settings";
import { Publisher } from "./Publisher";
import ObsidianAdaptor from "./adaptors/obsidian";
import { CompletedModal } from "./CompletedModal";
import { CustomConfluenceClient } from "./MyBaseClient";
import { ElectronMermaidRenderer } from "./mermaid_renderers/electron";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	_isSyncing: boolean = false;

	async onload() {
		await this.loadSettings();
		const { vault, metadataCache } = this.app;
		const mermaidRenderer = new ElectronMermaidRenderer();
		const confluenceClient = new CustomConfluenceClient({
			host: this.settings.confluenceBaseUrl,
			authentication: {
				basic: {
					email: this.settings.atlassianUserName,
					apiToken: this.settings.atlassianApiToken,
				},
			},
		});
		const publisher = new Publisher(
			new ObsidianAdaptor(vault, metadataCache, this.settings),
			this.settings,
			confluenceClient,
			mermaidRenderer
		);

		this.addRibbonIcon(
			"cloud",
			"Publish to Confluence",
			async (evt: MouseEvent) => {
				if (this._isSyncing) {
					new Notice("Syncing already on going");
					return;
				}
				this._isSyncing = true;
				try {
					const stats = await publisher.doPublish();
					new CompletedModal(this.app, stats).open();
				} catch (exceptionVar) {
					new Notice("Error publishing to Confluence");
					console.error(exceptionVar);
				} finally {
					this._isSyncing = false;
				}
			}
		);

		this.addCommand({
			id: "obsidian-confluence-publish-all",
			name: "Publish All to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this._isSyncing) {
					if (!checking) {
						this._isSyncing = true;
						publisher
							.doPublish()
							.then((stats) => {
								new CompletedModal(this.app, stats).open();
							})
							.finally(() => {
								this._isSyncing = false;
							});
					}
					return true;
				}
			},
		});

		this.addCommand({
			id: "obsidian-confluence-enable-publishing",
			name: "Enable publishing to Confluence",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				view: MarkdownView
			) => {
				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path
					)?.frontmatter;
					const file = view.file;
					const enabledForPublishing =
						(file.path.startsWith(this.settings.folderToPublish) &&
							(!frontMatter ||
								frontMatter["connie-publish"] !== false)) ||
						(frontMatter && frontMatter["connie-publish"] === true);
					return !enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(
					view.file,
					(frontmatter) => {
						if (
							view.file.path.startsWith(
								this.settings.folderToPublish
							)
						) {
							delete frontmatter["connie-publish"];
						} else {
							frontmatter["connie-publish"] = true;
						}
					}
				);
			},
		});

		this.addCommand({
			id: "obsidian-confluence-disable-publishing",
			name: "Disable publishing to Confluence",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				view: MarkdownView
			) => {
				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path
					)?.frontmatter;
					console.log({ frontMatter });
					const file = view.file;
					const enabledForPublishing =
						(file.path.startsWith(this.settings.folderToPublish) &&
							(!frontMatter ||
								frontMatter["connie-publish"] !== false)) ||
						(frontMatter && frontMatter["connie-publish"] === true);
					return enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(
					view.file,
					(frontmatter) => {
						if (
							view.file.path.startsWith(
								this.settings.folderToPublish
							)
						) {
							frontmatter["connie-publish"] = false;
						} else {
							delete frontmatter["connie-publish"];
						}
					}
				);
			},
		});

		this.addSettingTab(new MainSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
