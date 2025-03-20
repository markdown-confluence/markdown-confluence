import {
	BinaryFile,
	ConfluencePageConfig,
	ConfluenceUploadSettings,
	FilesToUpload,
	LoaderAdaptor,
	MarkdownFile,
} from "@markdown-confluence/lib";
import { lookup } from "mime-types";
import { App, MetadataCache, TFile, Vault } from "obsidian";
import { PublishMapping } from "../main";
import { Logger, LogLevel } from "../utils";

export default class ObsidianAdaptor implements LoaderAdaptor {
	vault: Vault;
	metadataCache: MetadataCache;
	settings: ConfluenceUploadSettings.ConfluenceSettings;
	app: App;
	private logger: Logger;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: ConfluenceUploadSettings.ConfluenceSettings,
		app: App,
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
		this.app = app;
		this.logger = Logger.createDefault();
		this.logger.updateOptions({
			prefix: "ObsidianAdaptor",
			minLevel: ('logLevel' in this.settings ? this.settings.logLevel as unknown as LogLevel : LogLevel.SILENT),
		});
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		this.logger.debug("Getting markdown files to upload");
		const files = this.vault.getMarkdownFiles();
		this.logger.debug(`Found ${files.length} total markdown files in vault`);
		const filesToPublish = [];

		// Get all valid folders to publish
		const publishFolders = ('publishMappings' in this.settings)
			? ((this.settings as unknown as { publishMappings: PublishMapping[] }).publishMappings.map(m => m.folderToPublish))
			: [this.settings.folderToPublish];

		this.logger.debug(`Checking files against publish folders: ${publishFolders.join(', ')}`);

		for (const file of files) {
			try {
				if (file.path.endsWith(".excalidraw")) {
					this.logger.debug(`Skipping excalidraw file: ${file.path}`);
					continue;
				}

				const fileFM = this.metadataCache.getCache(file.path);
				if (!fileFM) {
					this.logger.warn(`Missing file in metadata cache: ${file.path}`);
					throw new Error("Missing File in Metadata Cache");
				}
				const frontMatter = fileFM.frontmatter;

				// Check if file should be published (either in a publish folder or explicitly marked for publishing)
				const inPublishFolder = publishFolders.some(folder => file.path.startsWith(folder));

				if (
					(inPublishFolder &&
						(!frontMatter ||
							frontMatter["connie-publish"] !== false)) ||
					(frontMatter && frontMatter["connie-publish"] === true)
				) {
					this.logger.debug(`Adding file to publish: ${file.path}`);
					filesToPublish.push(file);
				} else {
					this.logger.debug(`Skipping file: ${file.path}`);
				}
			} catch (error) {
				this.logger.error(`Error processing file: ${error instanceof Error ? error.message : String(error)}`);
				//ignore
			}
		}
		this.logger.info(`Found ${filesToPublish.length} files to publish`);
		const filesToUpload = [];

		for (const file of filesToPublish) {
			const markdownFile = await this.loadMarkdownFile(file.path);
			filesToUpload.push(markdownFile);
		}

		return filesToUpload;
	}

	async loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile> {
		this.logger.debug(`Loading markdown file: ${absoluteFilePath}`);
		const file = this.app.vault.getAbstractFileByPath(absoluteFilePath);
		if (!(file instanceof TFile)) {
			throw new Error("Not a TFile");
		}

		const fileFM = this.metadataCache.getCache(file.path);
		if (!fileFM) {
			throw new Error("Missing File in Metadata Cache");
		}
		const frontMatter = fileFM.frontmatter;

		const parsedFrontMatter: Record<string, unknown> = {};
		if (frontMatter) {
			for (const [key, value] of Object.entries(frontMatter)) {
				parsedFrontMatter[key] = value;
			}
		}

		return {
			pageTitle: file.basename,
			folderName: file.parent?.name ?? "",
			absoluteFilePath: file.path,
			fileName: file.name,
			contents: await this.vault.cachedRead(file),
			frontmatter: parsedFrontMatter,
		};
	}

	async readBinary(
		path: string,
		referencedFromFilePath: string,
	): Promise<BinaryFile | false> {
		this.logger.debug(`Reading binary file: ${path} (referenced from ${referencedFromFilePath})`);
		const testing = this.metadataCache.getFirstLinkpathDest(
			path,
			referencedFromFilePath,
		);
		if (testing) {
			const files = await this.vault.readBinary(testing);
			const mimeType =
				lookup(testing.extension) || "application/octet-stream";
			return {
				contents: files,
				filePath: testing.path,
				filename: testing.name,
				mimeType: mimeType,
			};
		}

		return false;
	}
	async updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePageConfig.ConfluencePerPageAllValues>,
	): Promise<void> {
		this.logger.debug(`Updating markdown values for: ${absoluteFilePath}`, values);
		const config = ConfluencePageConfig.conniePerPageConfig;
		const file = this.app.vault.getAbstractFileByPath(absoluteFilePath);
		if (file instanceof TFile) {
			this.app.fileManager.processFrontMatter(file, (fm) => {
				for (const propertyKey in config) {
					if (!config.hasOwnProperty(propertyKey)) {
						continue;
					}

					const { key } =
						config[
						propertyKey as keyof ConfluencePageConfig.ConfluencePerPageConfig
						];
					const value =
						values[
						propertyKey as keyof ConfluencePageConfig.ConfluencePerPageAllValues
						];
					if (propertyKey in values) {
						fm[key] = value;
					}
				}
			});
		}
	}
}
