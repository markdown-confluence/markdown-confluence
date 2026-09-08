import { krokiFetch } from "./KrokiFetch";
import {
	KrokiRendererPlugin,
	HttpKrokiRenderer,
	DEFAULT_KROKI_SETTINGS,
} from "@markdown-confluence/lib";
import { Plugin, Notice, MarkdownView, Workspace, loadMermaid, type TFile } from "obsidian";
import {
	ADFProcessingPlugin,
	ConfluenceUploadSettings,
	Publisher,
	ConfluencePageConfig,
	MermaidRendererPlugin,
	MathRendererPlugin,
	PlantumlRendererPlugin,
	UploadAdfFileResult,
	MarkdownConfluencePlatform,
	MarkdownWorkspaceLive,
	MarkdownWorkspaceService,
	MarkdownSourceTransformerService,
	shouldPublishMarkdownFile,
} from "@markdown-confluence/lib";
import { Effect, Layer } from "effect";
import {
	ElectronMermaidRenderer,
	ElectronMathRenderer,
} from "@markdown-confluence/mermaid-electron-renderer";
import { HttpPlantumlRenderer } from "@markdown-confluence/plantuml-renderer";
import { ConfluenceSettingTab } from "./ConfluenceSettingTab";
import { CompletedModal } from "./CompletedModal";
import { BrowserOAuth, type BrowserOAuthSettings } from "./BrowserOAuth";
import { createObsidianConfluenceClient } from "./ObsidianAuthentication";
import {
	ConfluencePerPageForm,
	ConfluencePerPageUIValues,
	mapFrontmatterToConfluencePerPageUIValues,
} from "./ConfluencePerPageForm";
import { ObsidianPlatformLive } from "./effects/ObsidianPlatform";
import type { Mermaid, MermaidConfig } from "mermaid";
import { createDataviewTransformer } from "./DataviewTransformer";

export interface ObsidianPluginSettings
	extends ConfluenceUploadSettings.ConfluenceSettings, BrowserOAuthSettings {
	showPublishResultsModal: boolean;
	renderDataview: boolean;
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
	private publishAbort: AbortController | undefined;
	private publishStatus: HTMLElement | undefined;
	browserOAuth = new BrowserOAuth(
		() => this.settings,
		() => this.app.secretStorage,
		() => this.saveSettings(),
		(url) => {
			window.open(url, "_blank", "noopener,noreferrer");
		},
	);
	async authenticationClient() {
		const browser =
			this.settings.confluenceAuthType === "oauth2" && this.settings.oauthMode === "browser";
		if (browser) {
			const site = this.settings.oauthSites.find(
				(item) => item.id === this.settings.oauthSiteId,
			);
			if (!site) throw new Error("Connect and choose a Confluence site in settings.");
			if (
				this.settings.confluenceBaseUrl !==
				`https://api.atlassian.com/ex/confluence/${site.id}`
			)
				throw new Error(
					"The selected OAuth site differs from the publish destination. Choose your site again.",
				);
		}
		return createObsidianConfluenceClient(
			this.settings,
			browser ? await this.browserOAuth.accessToken() : undefined,
		);
	}
	async selectOAuthSite(id: string) {
		const site = this.settings.oauthSites.find((item) => item.id === id);
		if (!site) throw new Error("Choose an authorized Confluence site.");
		this.settings.oauthSiteId = id;
		this.settings.confluenceBaseUrl = `https://api.atlassian.com/ex/confluence/${site.id}`;
		this.settings.confluenceSiteUrl = site.url;
		await this.saveSettings();
	}

	private isSyncing = false;
	private isUnloaded = false;
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
	}

	private async createPublisher() {
		const confluenceClient = await this.authenticationClient();
		if (this.isUnloaded) throw new Error("The Confluence plugin was unloaded.");
		const mermaidItems = await this.getMermaidItems();
		if (this.isUnloaded) throw new Error("The Confluence plugin was unloaded.");
		const mermaidRenderer = new ElectronMermaidRenderer(
			mermaidItems.extraStyleSheets,
			mermaidItems.extraStyles,
			mermaidItems.mermaidConfig,
			mermaidItems.bodyStyles,
			this.settings.mermaid,
		);

		const plugins: ADFProcessingPlugin<unknown, unknown>[] = [
			new MathRendererPlugin(new ElectronMathRenderer()),
			new MermaidRendererPlugin(mermaidRenderer),
		];

		if (this.settings.kroki?.enabled)
			plugins.push(
				new KrokiRendererPlugin(
					new HttpKrokiRenderer({ ...this.settings.kroki, fetchImpl: krokiFetch }),
				),
			);
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

		return new Publisher(this.settings, confluenceClient, plugins, (message) => {
			this.publishStatus?.setText(message + " · click to cancel");
		});
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
				bodyStyles = "theme-light";
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

		const mermaidConfig: MermaidConfig = {
			...((await loadMermaid()) as Mermaid).mermaidAPI.getConfig(),
			theme: bodyStyles.split(/\s+/).includes("theme-dark") ? "dark" : "default",
		};
		// Recompute colors for the selected theme instead of reusing Obsidian's
		// previously derived colors, which can leave dark arrows on a dark image.
		delete mermaidConfig.themeVariables;
		return {
			extraStyleSheets,
			extraStyles,
			mermaidConfig,
			bodyStyles,
		};
	}

	async doPublish(publishFilter?: string): Promise<UploadResults> {
		this.publisher = await this.createPublisher();
		const adrFiles: FilePublishResult[] = await this.runObsidianEffect(
			this.publisher.publishEffect(publishFilter, {
				signal: this.publishAbort?.signal,
			}) as unknown as Effect.Effect<
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
		this.isUnloaded = false;
		await this.init();
		if (this.isUnloaded) return;
		this.publishStatus = this.addStatusBarItem();
		this.publishStatus.onclick = () => this.publishAbort?.abort();
		this.addCommand({
			id: "cancel-publish",
			name: "Cancel publishing after the current request",
			callback: () => {
				this.publishAbort?.abort();
				new Notice("Cancellation requested. Completed writes will be kept.");
			},
		});

		this.addRibbonIcon("cloud", "Publish to Confluence", async () => {
			await this.runPublish();
		});

		this.addCommand({
			id: "publish-current",
			name: "Publish Current File to Confluence",
			checkCallback: (checking: boolean) => {
				const activePath = this.activeLeafPath(this.workspace);
				if (!activePath) return false;
				if (!checking) {
					void this.runPublish(activePath);
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
			editorCheckCallback: (checking, _editor, view) =>
				this.setPublishingEnabled(checking, view.file, true),
		});

		this.addCommand({
			id: "disable-publishing",
			name: "Disable publishing to Confluence",
			editorCheckCallback: (checking, _editor, view) =>
				this.setPublishingEnabled(checking, view.file, false),
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

	override async onunload() {
		this.isUnloaded = true;
		this.publishAbort?.abort();
		this.publishStatus = undefined;
		this.browserOAuth.cancel();
	}

	private setPublishingEnabled(checking: boolean, file: TFile | null, enabled: boolean) {
		if (!file || this.isUnloaded) return false;
		const frontmatter = this.app.metadataCache.getCache(file.path)?.frontmatter;
		if (
			shouldPublishMarkdownFile(file.path, frontmatter, this.settings) === enabled ||
			(enabled &&
				!shouldPublishMarkdownFile(
					file.path,
					{ ...frontmatter, "connie-publish": true },
					this.settings,
				))
		)
			return false;
		if (!checking) {
			void this.app.fileManager
				.processFrontMatter(file, (values) => {
					values["connie-publish"] = enabled;
				})
				.catch((error: unknown) => {
					if (!this.isUnloaded)
						new Notice(`Could not update publishing: ${toError(error).message}`);
				});
		}
		return true;
	}

	async loadSettings() {
		const loaded = ((await this.loadData()) ?? {}) as Partial<ObsidianPluginSettings>;
		this.settings = Object.assign(
			{},
			ConfluenceUploadSettings.DEFAULT_SETTINGS,
			{
				mermaidTheme: "match-obsidian",
				showPublishResultsModal: true,
				renderDataview: false,
				oauthMode: "service-account",
				oauthFlow: "authorization-code",
				oauthClientId: "",
				oauthClientSecretId: "",
				oauthCallbackUrl: "http://127.0.0.1:8766/callback",
				oauthSecretId: "",
				oauthSites: [],
				oauthSiteId: "",
			},
			loaded,
			{
				// Deep-merge the nested plantuml object so a persisted partial (or
				// an older settings file missing it) keeps the defaults.
				kroki: { ...DEFAULT_KROKI_SETTINGS, ...loaded.kroki },
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
				Effect.provideService(
					MarkdownSourceTransformerService,
					createDataviewTransformer(this.app, this.settings),
				),
				Effect.provide(this.settingsLayer),
				Effect.provide(this.platform),
				Effect.mapError(toError),
			),
		);
	}

	private async runPublish(publishFilter?: string): Promise<void> {
		if (this.isUnloaded) return;
		if (this.isSyncing) {
			new Notice("A Confluence publish is already in progress.");
			return;
		}

		this.isSyncing = true;
		this.publishAbort = new AbortController();
		try {
			const stats = await this.doPublish(publishFilter);
			this.showPublishResults(stats);
		} catch (error) {
			this.showPublishError(error);
		} finally {
			this.isSyncing = false;
			this.publishAbort = undefined;
			this.publishStatus?.empty();
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
		if (this.isUnloaded) return;
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
