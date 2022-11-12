import { App, Vault, MetadataCache, TFile } from "obsidian";
import { CustomConfluenceClient } from "./MyBaseClient";
import { MyPluginSettings } from "./Settings";
import FolderFile from "./FolderFile.json";
import Test from "./callout.json";
import { CompletedModal } from "./CompletedModal";
import { MarkdownTransformer } from "./MarkdownTransformer";
import { JSONTransformer } from "@atlaskit/editor-json-transformer";
import { lookup } from "mime-types";
import { traverse, filter } from "@atlaskit/adf-utils/traverse";

export class FileToPublish {
	private readonly adfContent: string;
	private readonly title: string;

	constructor(title: string, adfContent: string) {
		this.title = title;
		this.adfContent = adfContent;
	}

	public getTitle(): string {
		return this.title;
	}
	public getAdfContent(): string {
		return this.adfContent;
	}
}
export class Publisher {
	vault: Vault;
	metadataCache: MetadataCache;

	settings: MyPluginSettings;
	confluenceClient: CustomConfluenceClient;
	frontmatterRegex: RegExp = /^\s*?---\n([\s\S]*?)\n---/g;
	app: App;
	transformer: MarkdownTransformer;
	serializer: JSONTransformer;

	constructor(
		app: App,
		vault: Vault,
		metadataCache: MetadataCache,
		settings: MyPluginSettings
	) {
		this.app = app;
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;

		this.transformer = new MarkdownTransformer();
		this.serializer = new JSONTransformer();

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

				if (
					(file.path.startsWith(this.settings.folderToPublish) &&
						(!frontMatter ||
							frontMatter["connie-publish"] !== false)) ||
					(frontMatter && frontMatter["connie-publish"] === true)
				) {
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
			expand: ["body.atlas_doc_format", "space"],
		});
		const spaceToPublishTo = parentPage.space;
		console.log({ parentPage });

		const files = await this.getFilesMarkedForPublishing();
		const foldersToMake = new Set(
			files.map((f) => {
				let folderName = `/${f.path.replace(f.name, "")}`;
				folderName = folderName.substring(0, folderName.length - 1);
				return folderName;
			})
		);

		console.log({ foldersToMake });

		for (const folder of foldersToMake) {
			const myFolders = folder.split("/");
			const folderFile = `${folder}/${myFolders.last()}.md`;
			console.log({ folderFile });
			if (files.find((file) => `/${file.path}` === folderFile)) {
				console.log("File Exists");
			}
		}

		//TODO: Create fake file to publish
		//TODO: Handle finding root folder
		//TODO: Stop using TFile for publishing

		const adrFileTasks = files.map(
			(file) =>
				this.publishFile(file, spaceToPublishTo!.key, parentPage.id) //TODO: Handle missing space key better
		);

		const adrFiles = await Promise.all(adrFileTasks);

		const stats = adrFiles.reduce(
			(previousValue, currentValue) => {
				const key = currentValue ? "successes" : "failures";
				previousValue[key]++;
				return previousValue;
			},
			{ successes: 0, failures: 0 }
		);

		new CompletedModal(this.app, stats).open();
	}

	async publishFile(
		file: TFile,
		spaceKey: string,
		parentPageId: string
	): Promise<boolean> {
		let text = await this.vault.cachedRead(file);
		text = text.replace(this.frontmatterRegex, "");

		const prosenodes = this.transformer.parse(text);
		const adrobj = this.serializer.encode(prosenodes);
		const adr = JSON.stringify(adrobj);

		const pageTitle = file.basename;
		const searchParams = {
			type: "page",
			spaceKey,
			title: pageTitle,
			expand: ["version", "body.atlas_doc_format"],
		};
		const contentByTitle = await this.confluenceClient.content.getContent(
			searchParams
		);

		if (contentByTitle.size > 0) {
			const currentPage = contentByTitle.results[0];

			if (currentPage?.body?.atlas_doc_format?.value === adr) {
				console.log("Page is the same not updating");
				return true;
			}

			console.log("Updating page", { currentPage });

			const updateContentDetails = {
				id: currentPage.id,
				ancestors: [{ id: parentPageId }],
				version: { number: (currentPage?.version?.number ?? 1) + 1 },
				title: pageTitle,
				type: "page",
				body: {
					atlas_doc_format: {
						value: adr,
						representation: "atlas_doc_format",
					},
				},
			};
			console.log({ updateContentDetails });

			await this.uploadFiles(currentPage.id, file.path, adrobj);

			//await this.confluenceClient.content.updateContent(
			//	updateContentDetails
			//);
		} else {
			console.log("Creating page");
			const creatingPageContent = {
				space: { key: spaceKey },
				ancestors: [{ id: parentPageId }],
				title: pageTitle,
				type: "page",
				body: {
					atlas_doc_format: {
						value: adr,
						representation: "atlas_doc_format",
					},
				},
			};
			console.log({ creatingPageContent });
			const pageDetails =
				await this.confluenceClient.content.createContent(
					creatingPageContent
				);
		}

		return true;
	}

	async uploadFiles(
		pageId: string,
		pageFilePath: string,
		adr: any
	): Promise<void> {
		const mediaNodes = filter(
			adr,
			(node) =>
				node.type === "media" && (node.attrs || {})?.type === "file"
		);

		console.log({ mediaNodes });

		const imagesToUpload = new Set(
			mediaNodes.map((node) => node?.attrs?.url)
		).values();

		for (const imageUrl of imagesToUpload) {
			console.log({ testing: imageUrl });
			const filename = imageUrl.split(":")[1];
			await this.uploadFile(pageId, pageFilePath, filename);
		}

		traverse(adr, {
			media: (node, parent) => {
				if (
					node.type === "file" &&
					!!node.url &&
					node.url.startswith("localfile:")
				) {
					console.info({ node });
					const localPath = node.url.replace("localfile:", "");
				}
			},
		});
	}

	async uploadFile(
		pageId: string,
		pageFilePath: string,
		fileNameToUpload: string
	): Promise<void> {
		const testing = this.metadataCache.getFirstLinkpathDest(
			fileNameToUpload,
			pageFilePath
		);
		if (!!testing) {
			const files = await this.vault.readBinary(testing);
			const mimeType = lookup(testing.extension);

			const attachmentDetails = {
				id: pageId,
				attachments: [
					{
						file: new Blob([files], { type: mimeType }),
						filename: testing.name,
						minorEdit: false,
					},
				],
			};

			console.log({ testing, attachmentDetails });
			//this.confluenceClient.contentAttachments.createOrUpdateAttachments(
			//		attachmentDetails
			//);
		}
	}
}
