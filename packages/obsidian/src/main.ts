import { Plugin, Notice, MarkdownView, Workspace, loadMermaid } from "obsidian";
import {
	ADFProcessingPlugin,
	ConfluenceUploadSettings,
	Publisher,
	ConfluencePageConfig,
	renderADFDoc,
	MermaidRendererPlugin,
	PlantumlRendererPlugin,
	UploadAdfFileResult,
	MarkdownConfluencePlatform,
	MarkdownWorkspaceLive,
	MarkdownWorkspaceService,
	createConfluenceClientConfig,
	shouldPublishMarkdownFile,
} from "@markdown-confluence/lib";
import { Effect, Layer } from "effect";
import { ElectronMermaidRenderer } from "@markdown-confluence/mermaid-electron-renderer";
import { HttpPlantumlRenderer } from "@markdown-confluence/plantuml-renderer";
import { ConfluenceSettingTab } from "./ConfluenceSettingTab";
import { CompletedModal } from "./CompletedModal";
import { ObsidianConfluenceClient } from "./MyBaseClient";
import {
	ConfluencePerPageForm,
	ConfluencePerPageUIValues,
	mapFrontmatterToConfluencePerPageUIValues,
} from "./ConfluencePerPageForm";
import { ObsidianPlatformLive } from "./effects/ObsidianPlatform";
import type { Mermaid } from "mermaid";

export interface ObsidianPluginSettings extends ConfluenceUploadSettings.ConfluenceSettings {
	showPublishResultsModal: boolean;
	mermaidTheme:
		| "match-obsidian"
		| "light-obsidian"
		| "dark-obsidian"
		| "default"
		| "neutral"
		| "dark"
		| "forest";
}

interface FailedFile {
	fileName: string;
	reason: string;
}

interface UploadResults {
	errorMessage: string | null;
	failedFiles: FailedFile[];
	filesUploadResult: UploadAdfFileResult[];
}

interface FilePublishResult {
	successfulUploadResult?: UploadAdfFileResult;
	node: {
		file: {
			absoluteFilePath: string;
		};
	};
	reason?: string;
}

export default class ConfluencePlugin extends Plugin {
	settings!: ObsidianPluginSettings;
	private isSyncing = false;
	private platform!: Layer.Layer<MarkdownConfluencePlatform>;
	private settingsLayer!: Layer.Layer<ConfluenceUploadSettings.ConfluenceSettingsService>;
	workspace!: Workspace;
	publisher!: Publisher;

	activeLeafPath(workspace: Workspace) {
		return workspace.getActiveViewOfType(MarkdownView)?.file?.path;
	}

	async init() {
		await this.loadSettings();
		const { workspace } = this.app;
		this.platform = ObsidianPlatformLive(this.app);
		this.settingsLayer = Layer.succeed(
			ConfluenceUploadSettings.ConfluenceSettingsService as never,
			this.settings,
		);
		this.workspace = workspace;

		const mermaidItems = await this.getMermaidItems();
		const mermaidRenderer = new ElectronMermaidRenderer(
			mermaidItems.extraStyleSheets,
			mermaidItems.extraStyles,
			mermaidItems.mermaidConfig,
			mermaidItems.bodyStyles,
		);
		const confluenceClient = new ObsidianConfluenceClient(
			createConfluenceClientConfig(this.settings, {
				middlewares: {
					onError(e) {
						if ("response" in e && "data" in e.response) {
							e.message =
								typeof e.response.data === "string"
									? e.response.data
									: JSON.stringify(e.response.data);
						}
					},
				},
			}),
		);

		const plugins: ADFProcessingPlugin<unknown, unknown>[] = [
			new MermaidRendererPlugin(mermaidRenderer),
		];

		if (this.settings.plantuml.enabled) {
			if (this.settings.plantuml.serverUrl) {
				plugins.push(
					new PlantumlRendererPlugin(
						new HttpPlantumlRenderer({
							serverUrl: this.settings.plantuml.serverUrl,
						}),
					),
				);
			} else {
				new Notice(
					"PlantUML rendering is enabled but the PlantUML server URL is empty. Configure it in the plugin settings.",
				);
			}
		}

		this.publisher = new Publisher(this.settings, confluenceClient, plugins);
	}

	async getMermaidItems() {
		const extraStyles: string[] = [];
		const extraStyleSheets: string[] = [];
		let bodyStyles = "";
		const body = document.querySelector("body") as HTMLBodyElement;

		switch (this.settings.mermaidTheme) {
			case "default":
			case "neutral":
			case "dark":
			case "forest":
				return {
					extraStyleSheets,
					extraStyles,
					mermaidConfig: { theme: this.settings.mermaidTheme },
					bodyStyles,
				};
			case "match-obsidian":
				bodyStyles = body.className;
				break;
			case "dark-obsidian":
				bodyStyles = "theme-dark";
				break;
			case "light-obsidian":
				bodyStyles = "theme-dark";
				break;
			default:
				throw new Error("Missing theme");
		}

		extraStyleSheets.push("app://obsidian.md/app.css");

		// @ts-expect-error
		const cssTheme = this.app.vault?.getConfig("cssTheme") as string;
		if (cssTheme) {
			const fileExists = await this.app.vault.adapter.exists(
				`.obsidian/themes/${cssTheme}/theme.css`,
			);
			if (fileExists) {
				const themeCss = await this.app.vault.adapter.read(
					`.obsidian/themes/${cssTheme}/theme.css`,
				);
				extraStyles.push(themeCss);
			}
		}

		const cssSnippets =
			// @ts-expect-error
			(this.app.vault?.getConfig("enabledCssSnippets") as string[]) ?? [];
		for (const snippet of cssSnippets) {
			const fileExists = await this.app.vault.adapter.exists(
				`.obsidian/snippets/${snippet}.css`,
			);
			if (fileExists) {
				const themeCss = await this.app.vault.adapter.read(
					`.obsidian/snippets/${snippet}.css`,
				);
				extraStyles.push(themeCss);
			}
		}

		return {
			extraStyleSheets,
			extraStyles,
			mermaidConfig: ((await loadMermaid()) as Mermaid).mermaidAPI.getConfig(),
			bodyStyles,
		};
	}

	async doPublish(publishFilter?: string): Promise<UploadResults> {
		const adrFiles: FilePublishResult[] = await this.runObsidianEffect(
			this.publisher.publishEffect(publishFilter) as unknown as Effect.Effect<
				FilePublishResult[],
				unknown,
				MarkdownConfluencePlatform | MarkdownWorkspaceService
			>,
		);

		const returnVal: UploadResults = {
			errorMessage: null,
			failedFiles: [],
			filesUploadResult: [],
		};

		adrFiles.forEach((element) => {
			if (element.successfulUploadResult) {
				returnVal.filesUploadResult.push(element.successfulUploadResult);
				return;
			}

			returnVal.failedFiles.push({
				fileName: element.node.file.absoluteFilePath,
				reason: element.reason ?? "No Reason Provided",
			});
		});

		return returnVal;
	}

	override async onload() {
		await this.init();

		this.addRibbonIcon("cloud", "Publish to Confluence", async () => {
			await this.runPublish();
		});

		this.addCommand({
			id: "adf-to-markdown",
			name: "ADF To Markdown",
			callback: async () => {
				console.log("HMMMM");
				const json = JSON.parse(
					'{"type":"doc","content":[{"type":"paragraph","content":[{"text":"Testing","type":"text"}]}],"version":1}',
				);
				console.log({ json });

				const confluenceClient = new ObsidianConfluenceClient(
					createConfluenceClientConfig(this.settings),
				);
				const testingPage = await confluenceClient.content.getContentById({
					id: "9732097",
					expand: ["body.atlas_doc_format", "space"],
				});
				const adf = JSON.parse(
					testingPage.body?.atlas_doc_format?.value || '{type: "doc", content:[]}',
				);
				renderADFDoc(adf);
			},
		});

		this.addCommand({
			id: "publish-current",
			name: "Publish Current File to Confluence",
			checkCallback: (checking: boolean) => {
				if (!checking) {
					void this.runPublish(this.activeLeafPath(this.workspace));
				}
				return true;
			},
		});

		this.addCommand({
			id: "publish-all",
			name: "Publish All to Confluence",
			checkCallback: (checking: boolean) => {
				if (!checking) {
					void this.runPublish();
				}
				return true;
			},
		});

		this.addCommand({
			id: "enable-publishing",
			name: "Enable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;
					const enabledForPublishing = shouldPublishMarkdownFile(
						file.path,
						frontMatter,
						this.settings,
					);
					return !enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(view.file, (frontmatter) => {
					if (view.file && view.file.path.startsWith(this.settings.folderToPublish)) {
						delete frontmatter["connie-publish"];
					} else {
						frontmatter["connie-publish"] = true;
					}
				});
				return true;
			},
		});

		this.addCommand({
			id: "disable-publishing",
			name: "Disable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) => {
				if (!view.file) {
					return false;
				}

				if (checking) {
					const frontMatter = this.app.metadataCache.getCache(
						view.file.path,
					)?.frontmatter;
					const file = view.file;
					const enabledForPublishing = shouldPublishMarkdownFile(
						file.path,
						frontMatter,
						this.settings,
					);
					return enabledForPublishing;
				}

				this.app.fileManager.processFrontMatter(view.file, (frontmatter) => {
					if (view.file && view.file.path.startsWith(this.settings.folderToPublish)) {
						frontmatter["connie-publish"] = false;
					} else {
						delete frontmatter["connie-publish"];
					}
				});
				return true;
			},
		});

		this.addCommand({
			id: "page-settings",
			name: "Update Confluence Page Settings",
			editorCallback: (_editor, view) => {
				if (!view.file) {
					return false;
				}

				const frontMatter = this.app.metadataCache.getCache(view.file.path)?.frontmatter;

				const file = view.file;

				new ConfluencePerPageForm(this.app, {
					config: ConfluencePageConfig.conniePerPageConfig,
					initialValues: mapFrontmatterToConfluencePerPageUIValues(frontMatter),
					onSubmit: (values, close) => {
						const valuesToSet: Partial<ConfluencePageConfig.ConfluencePerPageAllValues> =
							{};
						for (const propertyKey in values) {
							if (Object.prototype.hasOwnProperty.call(values, propertyKey)) {
								const element =
									values[propertyKey as keyof ConfluencePerPageUIValues];
								if (element.isSet) {
									valuesToSet[propertyKey as keyof ConfluencePerPageUIValues] =
										element.value as never;
								}
							}
						}
						void this.runObsidianEffect(
							Effect.flatMap(MarkdownWorkspaceService as never, (workspace: any) =>
								workspace.updateMarkdownValues(file.path, valuesToSet),
							),
						)
							.then(() => close())
							.catch((error) => {
								new Notice(toError(error).message);
							});
					},
				}).open();
				return true;
			},
		});

		this.addSettingTab(new ConfluenceSettingTab(this.app, this));
	}

	override async onunload() {}

	async loadSettings() {
		const loaded = ((await this.loadData()) ?? {}) as Partial<ObsidianPluginSettings>;
		this.settings = Object.assign(
			{},
			ConfluenceUploadSettings.DEFAULT_SETTINGS,
			{ mermaidTheme: "match-obsidian", showPublishResultsModal: true },
			loaded,
			{
				// Deep-merge the nested plantuml object so a persisted partial (or
				// an older settings file missing it) keeps the defaults.
				plantuml: {
					...ConfluenceUploadSettings.DEFAULT_SETTINGS.plantuml,
					...loaded.plantuml,
				},
			},
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.init();
	}

	private runObsidianEffect<A, E>(
		effect: Effect.Effect<A, E, MarkdownConfluencePlatform | MarkdownWorkspaceService>,
	): Promise<A> {
		return Effect.runPromise(
			effect.pipe(
				Effect.provide(MarkdownWorkspaceLive),
				Effect.provide(this.settingsLayer),
				Effect.provide(this.platform),
				Effect.mapError(toError),
			),
		);
	}

	private async runPublish(publishFilter?: string): Promise<void> {
		if (this.isSyncing) {
			new Notice("A Confluence publish is already in progress.");
			return;
		}

		this.isSyncing = true;
		try {
			const stats = await this.doPublish(publishFilter);
			this.showPublishResults(stats);
		} catch (error) {
			this.showPublishError(error);
		} finally {
			this.isSyncing = false;
		}
	}

	private showPublishError(error: unknown) {
		this.showPublishResults({
			errorMessage: toError(error).message,
			failedFiles: [],
			filesUploadResult: [],
		});
	}

	private showPublishResults(uploadResults: UploadResults) {
		if (this.settings.showPublishResultsModal) {
			new CompletedModal(this.app, {
				uploadResults,
			}).open();
			return;
		}

		new Notice(getPublishResultsMessage(uploadResults), 10000);
	}
}

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

function getPublishResultsMessage(uploadResults: UploadResults): string {
	if (uploadResults.errorMessage) {
		return `Confluence publish failed: ${uploadResults.errorMessage}`;
	}

	if (uploadResults.failedFiles.length > 0) {
		return `Confluence publish finished: ${uploadResults.filesUploadResult.length} succeeded, ${uploadResults.failedFiles.length} failed.`;
	}

	return `Confluence publish finished: ${uploadResults.filesUploadResult.length} file(s) processed.`;
}
