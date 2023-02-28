import { Vault, MetadataCache } from "obsidian";
import { MyPluginSettings } from "src/Settings";
import { BinaryFile, FilesToUpload, LoaderAdaptor } from "./types";
import { lookup } from "mime-types";

export default class ObsidianAdaptor implements LoaderAdaptor {
	vault: Vault;
	metadataCache: MetadataCache;
	settings: MyPluginSettings;

	constructor(
		vault: Vault,
		metadataCache: MetadataCache,
		settings: MyPluginSettings
	) {
		this.vault = vault;
		this.metadataCache = metadataCache;
		this.settings = settings;
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		const files = this.vault.getMarkdownFiles();
		const filesToPublish = [];
		for (const file of files) {
			try {
				if (file.path.endsWith(".excalidraw")) {
					continue;
				}

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
		const filesToUpload = [];

		for (const file of filesToPublish) {
			const frontMatter = this.metadataCache.getCache(
				file.path
			)!.frontmatter; //TODO: How to handle this better??

			const pageTitle =
				frontMatter &&
				frontMatter["title"] &&
				typeof frontMatter["title"] === "string"
					? frontMatter["title"]
					: file.basename;

			filesToUpload.push({
				pageTitle: pageTitle,
				folderName: file.parent.name,
				absoluteFilePath: file.path,
				fileName: file.name,
				contents: await this.vault.cachedRead(file),
			});
		}

		return filesToUpload;
	}

	async readBinary(
		path: string,
		referencedFromFilePath: string
	): Promise<BinaryFile | false> {
		const testing = this.metadataCache.getFirstLinkpathDest(
			path,
			referencedFromFilePath
		);
		if (!!testing) {
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
}
