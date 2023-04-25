import {
	Plugin,
	Notice,
	Editor,
	MarkdownView,
	WorkspaceLeaf,
	Workspace,
} from "obsidian";
import {
	ConfluenceUploadSettings,
	Publisher,
	ConfluencePageConfig,
} from "@markdown-confluence/lib";
import { ElectronMermaidRenderer } from "@markdown-confluence/mermaid-electron-renderer";
import { ConfluenceSettingTab } from "./ConfluenceSettingTab";
import ObsidianAdaptor from "./adaptors/obsidian";
import { CompletedModal } from "./CompletedModal";
import { ObsidianConfluenceClient } from "./MyBaseClient";
import AdfView, { ADF_VIEW_TYPE } from "./AdfView";
import {
	ConfluencePerPageForm,
	ConfluencePerPageUIValues,
	mapFrontmatterToConfluencePerPageUIValues,
} from "./ConfluencePerPageForm";

export default class ConfluencePlugin extends Plugin {
	settings: ConfluenceUploadSettings.ConfluenceSettings;
	private isSyncing = false;
	adfView: AdfView;
	workspace: Workspace;
	publisher: Publisher;
	adaptor: ObsidianAdaptor;

	activeLeafPath(workspace: Workspace) {
		return workspace.getActiveViewOfType(MarkdownView)?.file.path;
	}

	activeLeafName(workspace: Workspace) {
		return (
			workspace.getActiveViewOfType(MarkdownView)?.getDisplayText() ?? ""
		);
	}

	adfPreview() {
		const fileInfo = {
			path: this.activeLeafPath(this.workspace),
			basename: this.activeLeafName(this.workspace),
		};
		this.initPreview(fileInfo);
	}

	async initPreview(fileInfo: {
		path: string | undefined;
		basename: string;
	}) {
		if (this.app.workspace.getLeavesOfType(ADF_VIEW_TYPE).length > 0) {
			return;
		}
		const preview = this.app.workspace.getLeaf("split");
		const mmPreview = new AdfView(
			this.settings,
			preview,
			fileInfo,
			this.adaptor
		);
		preview.open(mmPreview);
	}

	async init() {
		await this.loadSettings();
		const { vault, metadataCache, workspace } = this.app;
		this.workspace = workspace;
		this.adaptor = new ObsidianAdaptor(
			vault,
			metadataCache,
			this.settings,
			this.app
		);
		const mermaidRenderer = new ElectronMermaidRenderer();
		const confluenceClient = new ObsidianConfluenceClient({
			host: this.settings.confluenceBaseUrl,
			authentication: {
				basic: {
					email: this.settings.atlassianUserName,
					apiToken: this.settings.atlassianApiToken,
				},
			},
		});

		const settingsLoader =
			new ConfluenceUploadSettings.StaticSettingsLoader(this.settings);
		this.publisher = new Publisher(
			this.adaptor,
			settingsLoader,
			confluenceClient,
			mermaidRenderer
		);
	}

	async onload() {
		await this.init();

		this.registerView(
			ADF_VIEW_TYPE,
			(leaf: WorkspaceLeaf) =>
				new AdfView(
					this.settings,
					leaf,
					{
						path: this.activeLeafPath(this.workspace),
						basename: this.activeLeafName(this.workspace),
					},
					this.adaptor
				)
		);

		this.addCommand({
			id: "adf-preview",
			name: "Preview the current note rendered to ADF",
			callback: () => this.adfPreview(),
			hotkeys: [],
		});

		this.addRibbonIcon(
			"cloud",
			"Publish to Confluence",
			async (evt: MouseEvent) => {
				if (this.isSyncing) {
					new Notice("Syncing already on going");
					return;
				}
				this.isSyncing = true;
				try {
					const stats = await this.publisher.doPublish();
					new CompletedModal(this.app, {
						uploadResults: stats,
					}).open();
				} catch (error) {
					if (error instanceof Error) {
						new CompletedModal(this.app, {
							uploadResults: {
								errorMessage: error.message,
								failedFiles: [],
								filesUploadResult: [],
							},
						}).open();
					} else {
						new CompletedModal(this.app, {
							uploadResults: {
								errorMessage: JSON.stringify(error),
								failedFiles: [],
								filesUploadResult: [],
							},
						}).open();
					}
				} finally {
					this.isSyncing = false;
				}
			}
		);

		this.addCommand({
			id: "publish-current",
			name: "Publish Current File to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this.isSyncing) {
					if (!checking) {
						this.isSyncing = true;
						this.publisher
							.doPublish(this.activeLeafPath(this.workspace))
							.then((stats) => {
								new CompletedModal(this.app, {
									uploadResults: stats,
								}).open();
							})
							.catch((error) => {
								if (error instanceof Error) {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: error.message,
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								} else {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: JSON.stringify(error),
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								}
							})
							.finally(() => {
								this.isSyncing = false;
							});
					}
					return true;
				}
			},
		});

		this.addCommand({
			id: "publish-all",
			name: "Publish All to Confluence",
			checkCallback: (checking: boolean) => {
				if (!this.isSyncing) {
					if (!checking) {
						this.isSyncing = true;
						this.publisher
							.doPublish()
							.then((stats) => {
								new CompletedModal(this.app, {
									uploadResults: stats,
								}).open();
							})
							.catch((error) => {
								if (error instanceof Error) {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: error.message,
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								} else {
									new CompletedModal(this.app, {
										uploadResults: {
											errorMessage: JSON.stringify(error),
											failedFiles: [],
											filesUploadResult: [],
										},
									}).open();
								}
							})
							.finally(() => {
								this.isSyncing = false;
							});
					}
					return true;
				}
			},
		});

		this.addCommand({
			id: "enable-publishing",
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
			id: "disable-publishing",
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

		this.addCommand({
			id: "page-settings",
			name: "Update Confluence Page Settings",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const frontMatter = this.app.metadataCache.getCache(
					view.file.path
				)?.frontmatter;

				const file = view.file;

				new ConfluencePerPageForm(this.app, {
					config: ConfluencePageConfig.conniePerPageConfig,
					initialValues:
						mapFrontmatterToConfluencePerPageUIValues(frontMatter),
					onSubmit: (values, close) => {
						const valuesToSet: Partial<ConfluencePageConfig.ConfluencePerPageAllValues> =
							{};
						for (const propertyKey in values) {
							if (
								Object.prototype.hasOwnProperty.call(
									values,
									propertyKey
								)
							) {
								const element =
									values[
										propertyKey as keyof ConfluencePerPageUIValues
									];
								if (element.isSet) {
									valuesToSet[
										propertyKey as keyof ConfluencePerPageUIValues
									] = element.value as never;
								}
							}
						}
						this.adaptor.updateMarkdownValues(
							file.path,
							valuesToSet
						);
						close();
					},
				}).open();
			},
		});

		this.addSettingTab(new ConfluenceSettingTab(this.app, this));
	}

	async onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			ConfluenceUploadSettings.DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.init();
	}
}
