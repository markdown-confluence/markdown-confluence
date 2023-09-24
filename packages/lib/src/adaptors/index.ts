import { Api } from "confluence.js";
import { ConfluencePerPageAllValues } from "../ConniePageConfig";
export type FilesToUpload = Array<MarkdownFile>;

export interface MarkdownFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: string;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
}

export interface BinaryFile {
	filename: string;
	filePath: string;
	mimeType: string;
	contents: ArrayBuffer;
}

export interface LoaderAdaptor {
	updateMarkdownValues(
		absoluteFilePath: string,
		values: Partial<ConfluencePerPageAllValues>,
	): Promise<void>;
	loadMarkdownFile(absoluteFilePath: string): Promise<MarkdownFile>;
	getMarkdownFilesToUpload(): Promise<FilesToUpload>;
	readBinary(
		path: string,
		referencedFromFilePath: string,
	): Promise<BinaryFile | false>;
}

export interface RequiredConfluenceClient {
	content: Api.Content;
	space: Api.Space;
	contentAttachments: Api.ContentAttachments;
	contentLabels: Api.ContentLabels;
	users: Api.Users;
}

export * from "./filesystem";
