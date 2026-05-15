import { ConfluenceSettings } from "../Settings";
import { BinaryFile, FilesToUpload, LoaderAdaptor, MarkdownFile } from ".";
import { lookup } from "mime-types";
import { existsSync, lstatSync } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import matter from "gray-matter";
import {
	ConfluencePerPageAllValues,
	ConfluencePerPageConfig,
	conniePerPageConfig,
} from "../ConniePageConfig";

export class FileSystemAdaptor implements LoaderAdaptor {
	settings: ConfluenceSettings;

	constructor(settings: ConfluenceSettings) {
		this.settings = {
			...settings,
			contentRoot: normalizeContentRoot(settings.contentRoot),
		};

		if (!existsSync(this.settings.contentRoot)) {
			throw new Error(`'${this.settings.contentRoot}' doesn't exist.`);
		}
		if (!lstatSync(this.settings.contentRoot).isDirectory()) {
			throw new Error(
				`'${this.settings.contentRoot}' is not a directory.`,
			);
		}
	}

	async getFileContent(absoluteFilePath: string) {
		const fileContent = await fs.readFile(absoluteFilePath, "utf-8");
		const { data, content } = matter(fileContent);
		return { data, content };
	}

	async updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePerPageAllValues>,
	): Promise<void> {
		const actualAbsoluteFilePath = resolveContentFilePath(
			this.settings.contentRoot,
			absoluteFilePath,
		);
		try {
			if (!(await fs.stat(actualAbsoluteFilePath)).isFile()) {
				return;
			}
		} catch (error: unknown) {
			if (error instanceof Error) {
				console.warn(
					"updateMarkdownValues",
					JSON.stringify({
						actualAbsoluteFilePath,
						absoluteFilePath,
						contentRoot: this.settings.contentRoot,
						errorMessage: error.message,
					}),
				);
			} else {
				console.warn(
					"updateMarkdownValues:",
					JSON.stringify({
						actualAbsoluteFilePath,
						contentRoot: this.settings.contentRoot,
						absoluteFilePath,
						error,
					}),
				);
			}
			return;
		}

		const fileContent = await this.getFileContent(actualAbsoluteFilePath);

		const config = conniePerPageConfig;

		const fm: { [key: string]: unknown } = {};
		for (const propertyKey in config) {
			if (!config.hasOwnProperty(propertyKey)) {
				continue;
			}

			const { key } =
				config[propertyKey as keyof ConfluencePerPageConfig];
			const value =
				values[propertyKey as keyof ConfluencePerPageAllValues];
			if (propertyKey in values) {
				if (value) {
					fm[key] = value;
				} else {
					if (key in fileContent.data) {
						delete fileContent.data[key];
					}
				}
			}
		}

		const updatedData = matter.stringify(fileContent, fm);
		await fs.writeFile(actualAbsoluteFilePath, updatedData);
	}

	async loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile> {
		const { data, content: contents } = await this.getFileContent(
			absoluteFilePath,
		);

		const folderName = path.basename(path.parse(absoluteFilePath).dir);
		const fileName = path.basename(absoluteFilePath);

		const extension = path.extname(fileName);
		const pageTitle = path.basename(fileName, extension);

		return {
			folderName,
			absoluteFilePath: absoluteFilePath.replace(
				this.settings.contentRoot,
				"",
			),
			fileName,
			pageTitle,
			contents,
			frontmatter: data,
		};
	}

	async loadMarkdownFiles(folderPath: string): Promise<MarkdownFile[]> {
		const files: MarkdownFile[] = [];

		const entries = await fs.readdir(folderPath, {
			withFileTypes: true,
		});

		for (const entry of entries) {
			const absoluteFilePath = path.join(folderPath, entry.name);

			if (entry.isFile() && path.extname(entry.name) === ".md") {
				const file = await this.loadMarkdownFile(absoluteFilePath);
				files.push(file);
			} else if (entry.isDirectory()) {
				const subFiles = await this.loadMarkdownFiles(absoluteFilePath);
				files.push(...subFiles);
			}
		}

		return files;
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		const files = await this.loadMarkdownFiles(this.settings.contentRoot);
		const filesToPublish = [];
		for (const file of files) {
			try {
				const frontMatter = file.frontmatter;

				if (
					((file.absoluteFilePath.startsWith(
						this.settings.folderToPublish,
					) ||
						this.settings.folderToPublish === ".") &&
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

	async readBinary(
		searchPath: string,
		referencedFromFilePath: string,
	): Promise<BinaryFile | false> {
		const absoluteFilePath = await this.findClosestFile(
			searchPath,
			path.dirname(
				path.join(this.settings.contentRoot, referencedFromFilePath),
			),
		);

		if (absoluteFilePath) {
			const fileContents = await fs.readFile(absoluteFilePath);

			const mimeType =
				lookup(path.extname(absoluteFilePath)) ||
				"application/octet-stream";
			return {
				contents: fileContents,
				filePath: absoluteFilePath.replace(
					this.settings.contentRoot,
					"",
				),
				filename: path.basename(absoluteFilePath),
				mimeType: mimeType,
			};
		}

		return false;
	}

	private async findClosestFile(
		fileName: string,
		startingDirectory: string,
	): Promise<string | null> {
		const potentialAbsolutePathForFileName = path.join(
			startingDirectory,
			fileName,
		);
		if (await isFile(potentialAbsolutePathForFileName)) {
			return potentialAbsolutePathForFileName;
		}

		const matchingFiles: string[] = [];
		const directoriesToSearch: string[] = [startingDirectory];

		while (directoriesToSearch.length > 0) {
			const currentDirectory = directoriesToSearch.shift();
			if (!currentDirectory) {
				continue;
			}

			const entries = await fs.readdir(currentDirectory, {
				withFileTypes: true,
			});

			for (const entry of entries) {
				const fullPath = path.join(currentDirectory, entry.name);

				if (
					entry.isFile() &&
					entry.name.toLowerCase() === fileName.toLowerCase()
				) {
					matchingFiles.push(fullPath);
				} else if (
					entry.isDirectory() &&
					fullPath.startsWith(this.settings.contentRoot)
				) {
					directoriesToSearch.push(fullPath);
				}
			}
		}

		const firstMatchedFile = matchingFiles[0];
		if (firstMatchedFile) {
			return firstMatchedFile;
		}

		const parentDirectory = path.dirname(startingDirectory);

		if (parentDirectory === startingDirectory) {
			return null;
		}

		return await this.findClosestFile(fileName, parentDirectory);
	}
}

function resolveContentFilePath(contentRoot: string, filePath: string): string {
	if (path.isAbsolute(filePath)) {
		return filePath;
	}

	const pathFromContentRoot = path.resolve(contentRoot, filePath);
	const pathFromWorkingDirectory = path.resolve(filePath);

	if (isPathInside(contentRoot, pathFromWorkingDirectory)) {
		if (
			existsSync(pathFromWorkingDirectory) ||
			!existsSync(pathFromContentRoot)
		) {
			return pathFromWorkingDirectory;
		}
	}

	return pathFromContentRoot;
}

function isPathInside(parentPath: string, childPath: string): boolean {
	const relativePath = path.relative(parentPath, childPath);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	);
}

function normalizeContentRoot(contentRoot: string): string {
	const resolvedContentRoot = path.resolve(contentRoot);
	return resolvedContentRoot.endsWith(path.sep)
		? resolvedContentRoot
		: `${resolvedContentRoot}${path.sep}`;
}

async function isFile(filePath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(filePath);
		return stats.isFile();
	} catch (error: unknown) {
		return false; // Just return false instead of rethrowing any other errors.
	}
}
