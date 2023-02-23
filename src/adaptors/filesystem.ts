import { MyPluginSettings } from "src/Settings";
import { BinaryFile, FilesToUpload, LoaderAdaptor } from "./types";
import { lookup } from "mime-types";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

interface MarkdownFrontmatter {
	[key: string]: any;
}

interface MarkdownFile {
	folder: string;
	fullPath: string;
	name: string;
	content: string;
	data: MarkdownFrontmatter;
}

export default class FilesystemAdaptor implements LoaderAdaptor {
	settings: MyPluginSettings;
	folderPath: string;

	constructor(settings: MyPluginSettings, folderPath: string) {
		this.settings = settings;
		this.folderPath = folderPath;
	}

	async loadMarkdownFiles(folderPath: string): Promise<MarkdownFile[]> {
		const files: MarkdownFile[] = [];

		const entries = await fs.promises.readdir(folderPath, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const entryPath = path.join(folderPath, entry.name);

			if (entry.isFile() && path.extname(entry.name) === ".md") {
				const fileContent = fs.readFileSync(entryPath, "utf-8");
				const { data, content } = matter(fileContent);

				const folder = path.basename(folderPath);
				const name = path.parse(entry.name).name;

				files.push({
					folder,
					name,
					content,
					data,
					fullPath: entryPath,
				});
			} else if (entry.isDirectory()) {
				const subFiles = await this.loadMarkdownFiles(entryPath);
				files.push(...subFiles);
			}
		}

		return files;
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		const files = await this.loadMarkdownFiles(this.folderPath);
		const filesToPublish = [];
		for (const file of files) {
			try {
				const frontMatter = file.data;

				if (
					(file.fullPath.startsWith(this.settings.folderToPublish) &&
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
			filesToUpload.push({
				pageTitle: file.name,
				folderName: file.folder,
				absoluteFilePath: file.fullPath,
				fileName: file.name,
				contents: file.content,
			});
		}

		return filesToUpload;
	}

	async readBinary(
		searchPath: string,
		referencedFromFilePath: string
	): Promise<BinaryFile | false> {
		/*
		const testing = await this.findClosestFile(
				searchPath,
				path.dirname(referencedFromFilePath)
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
		*/

		return false;
	}

	async findClosestFile(
		fileName: string,
		startingDirectory: string
	): Promise<string | null> {
		const matchingFiles: string[] = [];
		const directoriesToSearch: string[] = [startingDirectory];

		while (directoriesToSearch.length > 0) {
			const currentDirectory = directoriesToSearch.shift()!;
			const entries = await fs.promises.readdir(currentDirectory, {
				withFileTypes: true,
			});

			for (const entry of entries) {
				const fullPath = path.join(currentDirectory, entry.name);

				if (
					entry.isFile() &&
					entry.name.toLowerCase() === fileName.toLowerCase()
				) {
					matchingFiles.push(fullPath);
				} else if (entry.isDirectory()) {
					directoriesToSearch.push(fullPath);
				}
			}
		}

		if (matchingFiles.length > 0) {
			return matchingFiles[0];
		}

		const parentDirectory = path.dirname(startingDirectory);

		if (parentDirectory === startingDirectory) {
			return null;
		}

		return await this.findClosestFile(fileName, parentDirectory);
	}
}
