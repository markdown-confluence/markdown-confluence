import {
	Plugin,
	Notice,
	Editor,
	MarkdownView,
	WorkspaceLeaf,
	Workspace,
} from "obsidian";
import { MainSettingTab } from "./MainSettingTab";
import { DEFAULT_SETTINGS, MyPluginSettings } from "./Settings";
import { Publisher } from "./Publisher";
import ObsidianAdaptor from "./adaptors/obsidian";
import { CompletedModal } from "./CompletedModal";
import { CustomConfluenceClient } from "./MyBaseClient";
import { ElectronMermaidRenderer } from "./mermaid_renderers/electron";
import AdfView, { ADF_VIEW_TYPE } from "./AdfView";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	_isSyncing: boolean = false;
	adfView: AdfView;
	workspace: Workspace;
	publisher: Publisher;

	activeLeafPath(workspace: Workspace) {
		return workspace.activeLeaf?.view.getState().file;
	}

	activeLeafName(workspace: Workspace) {
		return (
			workspace.activeLeaf?.getDisplayText() ||
			" TODO TESTING CRAP TO BE REMOVED "
		);
	}

	adfPreview() {
		const fileInfo = {
			path: this.activeLeafPath(this.workspace),
			basename: this.activeLeafName(this.workspace),
		};
		this.initPreview(fileInfo);
	}

	async initPreview(fileInfo: any) {
		if (this.app.workspace.getLeavesOfType(ADF_VIEW_TYPE).length > 0) {
			return;
		}
		const preview = this.app.workspace.getLeaf("split");
		const mmPreview = new AdfView(this.settings, preview, fileInfo);
		preview.open(mmPreview);
	}

	async init() {
		await this.loadSettings();
		const { vault, metadataCache, workspace } = this.app;
		this.workspace = workspace;
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

		this.publisher = new Publisher(
			new ObsidianAdaptor(vault, metadataCache, this.settings),
			this.settings,
			confluenceClient,
			mermaidRenderer
		);
	}

	async onload() {
		await this.init();

		this.registerView(
			ADF_VIEW_TYPE,
			(leaf: WorkspaceLeaf) =>
				(this.adfView = new AdfView(this.settings, leaf, {
					path: this.activeLeafPath(this.workspace),
					basename: this.activeLeafName(this.workspace),
				}))
		);

		this.addCommand({
			id: "app:adf-preview",
			name: "Preview the current note rendered to ADF",
			callback: () => this.adfPreview(),
			hotkeys: [],
		});

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
					const stats = await this.publisher.doPublish();
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
						this.publisher
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

	async onunload() {
		this.app.workspace.detachLeavesOfType(ADF_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.init();
		await this.saveData(this.settings);
	}
}
