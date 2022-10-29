import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Vault, MetadataCache, TFile } from 'obsidian';
import { CustomConfluenceClient } from './MyBaseClient';
import * as confluence from 'showdown-confluence'

interface MyPluginSettings {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	confluenceBaseUrl: '',
	confluenceParentId: '',
	atlassianUserName: '',
	atlassianApiToken: '',
	folderToPublish: 'Confluence Pages',
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Publish to Confluence',
			callback: async () => {
				//new SampleModal(this.app).open();
				const { vault, workspace, metadataCache } = this.app;
				const publisher = new Publisher(vault, metadataCache, this.settings)
				await publisher.doPublish();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class Publisher {

	vault: Vault;
	metadataCache: MetadataCache;

	settings: MyPluginSettings;
	confluenceClient: CustomConfluenceClient;
	frontmatterRegex: RegExp = /^\s*?---\n([\s\S]*?)\n---/g;

	constructor(vault: Vault, metadataCache: MetadataCache, settings: MyPluginSettings) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;

		this.confluenceClient = new CustomConfluenceClient({
			host: 'https://hello.atlassian.net',
			authentication: {
				basic: {
					email: this.settings.atlassianUserName,
					apiToken: this.settings.atlassianApiToken,
				},
			},
		});
	}


	async getFilesMarkedForPublishing(): Promise<TFile[]> {
		const files = this.vault.getMarkdownFiles();
		const filesToPublish = [];
		for (const file of files) {
			try {
				const frontMatter = this.metadataCache.getCache(file.path).frontmatter
				if (file.basename === "Test Note - Frontmatter opted out")
					{
						console.log({frontMatter})
					}
				if (
					(file.path.startsWith(this.settings.folderToPublish) && (!frontMatter || frontMatter["connie-publish"] !== false))
					|| (frontMatter && frontMatter["connie-publish"] === true)
					) {
					console.log({file});
					filesToPublish.push(file);
				}
			} catch {
				//ignore
			}
		}

		return filesToPublish;
	}

	async doPublish() {

		const parentPage = await this.confluenceClient.content.getContentById({id: this.settings.confluenceParentId, expand: ["body.storage", "space"]});
		const spaceToPublishTo = parentPage.space;
		console.log({parentPage});

		const files = await this.getFilesMarkedForPublishing()
		console.log({filesToPublish: files});

		const adrFileTasks = files.map(file => this.publishFile(file, spaceToPublishTo.key, parentPage.id))

		const adrFiles = await Promise.all(adrFileTasks);
		console.log({adrFiles});
	}

	async publishFile(file: TFile, spaceKey: string, parentPageId: string){
		let text = await this.vault.cachedRead(file);
		console.log({text})
		const converter = new confluence.Converter();
		text = text.replace(this.frontmatterRegex, "");
		const adr = converter.makeHtml(text);

		const pageTitle = file.basename
		const searchParams = {type: "page", spaceKey, title: pageTitle, expand: "version"};
		console.log({searchParams});
		const contentByTitle = await this.confluenceClient.content.getContent(searchParams);
		console.log({contentByTitle});

		if (contentByTitle.size > 0)
		{
			const currentPage = contentByTitle.results[0];
			console.log("Updating page", {currentPage})

			const updateContentDetails = {
				id: currentPage.id,
				ancestors: [{id: parentPageId}],
				version: {number: (currentPage?.version?.number ?? 1) + 1},
				title: pageTitle,
				type: "page",
				body: {storage: {value: adr, representation: "storage"}}
			};
			console.log({updateContentDetails});
			await this.confluenceClient.content.updateContent(updateContentDetails)
		} else {
			console.log("Creating page")
			const creatingPageContent = {
				space: {key: spaceKey},
				ancestors: [{id: parentPageId}],
				title: pageTitle,
				type: "page",
				body: {storage: {value: adr, representation: "storage"}}
			};
			console.log({creatingPageContent});
			await this.confluenceClient.content.createContent(creatingPageContent);
		}
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Confluence Domain')
			.setDesc('Confluence Domain eg "https://mysite.atlassian.net"')
			.addText(text => text
			.setPlaceholder('https://mysite.atlassian.net')
			.setValue(this.plugin.settings.confluenceBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.confluenceBaseUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName('Atlassian Username')
		.setDesc('eg "username@domain.com"')
		.addText(text => text
		.setPlaceholder('username@domain.com')
		.setValue(this.plugin.settings.atlassianUserName)
		.onChange(async (value) => {
			this.plugin.settings.atlassianUserName = value;
			await this.plugin.saveSettings();
		}));

		new Setting(containerEl)
		.setName('Atlassian API Token')
		.setDesc('')
		.addText(text => text
		.setPlaceholder('')
		.setValue(this.plugin.settings.atlassianApiToken)
		.onChange(async (value) => {
			this.plugin.settings.atlassianApiToken = value;
			await this.plugin.saveSettings();
		}));

		new Setting(containerEl)
		.setName('Confluence Parent Page ID')
		.setDesc('Page ID to publish files under')
		.addText(text => text
		.setPlaceholder('23232345645')
		.setValue(this.plugin.settings.confluenceParentId)
		.onChange(async (value) => {
			this.plugin.settings.confluenceParentId = value;
			await this.plugin.saveSettings();
		}));

		new Setting(containerEl)
		.setName('Folder to publish')
		.setDesc('Publish all files except notes that are excluded using YAML Frontmatter')
		.addText(text => text
		.setPlaceholder('')
		.setValue(this.plugin.settings.folderToPublish)
		.onChange(async (value) => {
			this.plugin.settings.folderToPublish = value;
			await this.plugin.saveSettings();
		}));
	}
}
