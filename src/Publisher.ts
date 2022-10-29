import { Vault, MetadataCache, TFile } from "obsidian";
import { CustomConfluenceClient } from "./MyBaseClient";
import { MyPluginSettings } from "./Settings";
import * as confluence from "showdown-confluence";
import FolderFile from "./FolderFile.txt";

export class Publisher {
	vault: Vault;
	metadataCache: MetadataCache;

	settings: MyPluginSettings;
	confluenceClient: CustomConfluenceClient;
	frontmatterRegex: RegExp = /^\s*?---\n([\s\S]*?)\n---/g;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: MyPluginSettings
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;

		this.confluenceClient = new CustomConfluenceClient({
			host: "https://hello.atlassian.net",
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
				const frontMatter = this.metadataCache.getCache(
					file.path
				)!.frontmatter; //TODO: How to handle this better??

				if (file.basename === "Test Note - Frontmatter opted out") {
					console.log({ frontMatter });
				}
				if (
					(file.path.startsWith(this.settings.folderToPublish) &&
						(!frontMatter ||
							frontMatter["connie-publish"] !== false)) ||
					(frontMatter && frontMatter["connie-publish"] === true)
				) {
					console.log({ file });
					filesToPublish.push(file);
				}
			} catch {
				//ignore
			}
		}

		return filesToPublish;
	}

	async doPublish() {
		const parentPage = await this.confluenceClient.content.getContentById({
			id: this.settings.confluenceParentId,
			expand: ["body.storage", "space"],
		});
		const spaceToPublishTo = parentPage.space;
		console.log({ parentPage });

		const files = await this.getFilesMarkedForPublishing();
		console.log({ filesToPublish: files });

		const adrFileTasks = files.map(
			(file) =>
				this.publishFile(file, spaceToPublishTo!.key, parentPage.id) //TODO: Handle missing space key better
		);

		const adrFiles = await Promise.all(adrFileTasks);
		console.log({ adrFiles });
	}

	async publishFile(file: TFile, spaceKey: string, parentPageId: string) {
		let text = await this.vault.cachedRead(file);
		console.log({ text });
		const converter = new confluence.Converter();
		text = text.replace(this.frontmatterRegex, "");
		const adr = converter.makeHtml(text);

		const pageTitle = file.basename;
		const searchParams = {
			type: "page",
			spaceKey,
			title: pageTitle,
			expand: ["version", "body.storage"],
		};
		console.log({ searchParams });
		const contentByTitle = await this.confluenceClient.content.getContent(
			searchParams
		);
		console.log({ contentByTitle });

		if (contentByTitle.size > 0) {
			const currentPage = contentByTitle.results[0];

			if (currentPage.body.storage.value === adr) {
				console.log("Page is the same not updating");
				return;
			}

			console.log("Updating page", { currentPage });

			const updateContentDetails = {
				id: currentPage.id,
				ancestors: [{ id: parentPageId }],
				version: { number: (currentPage?.version?.number ?? 1) + 1 },
				title: pageTitle,
				type: "page",
				body: { storage: { value: adr, representation: "storage" } },
			};
			console.log({ updateContentDetails });
			await this.confluenceClient.content.updateContent(
				updateContentDetails
			);
		} else {
			console.log("Creating page");
			const creatingPageContent = {
				space: { key: spaceKey },
				ancestors: [{ id: parentPageId }],
				title: pageTitle,
				type: "page",
				body: { storage: { value: adr, representation: "storage" } },
			};
			console.log({ creatingPageContent });
			await this.confluenceClient.content.createContent(
				creatingPageContent
			);
		}
	}
}
