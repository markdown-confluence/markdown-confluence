import { ConfluenceSettings } from "./Settings";
import { traverse, filter } from "@atlaskit/adf-utils/traverse";
import { CustomConfluenceClient, LoaderAdaptor } from "./adaptors";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { createFolderStructure as createLocalAdfTree } from "./TreeLocal";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import { uploadBuffer, UploadedImageData, uploadFile } from "./Attachments";
import { prepareAdf } from "./AdfPostProcess";
import { adfEqual } from "./AdfEqual";
import {
	getMermaidFileName,
	MermaidRenderer,
	ChartData,
} from "./mermaid_renderers";

export interface FailedFile {
	fileName: string;
	reason: string;
}

export interface UploadResults {
	errorMessage: string | null;
	failedFiles: FailedFile[];
	filesUploadResult: UploadAdfFileResult[];
}

export interface LocalAdfFileTreeNode {
	name: string;
	children: LocalAdfFileTreeNode[];
	file?: LocalAdfFile;
}

interface FilePublishResult {
	successfulUploadResult?: UploadAdfFileResult;
	node: ConfluenceNode;
	reason?: string;
}

export interface LocalAdfFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: JSONDocNode;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
	tags: string[];
	pageId: string | undefined;
	dontChangeParentPageId: boolean;
}

export interface ConfluenceAdfFile {
	folderName: string;
	absoluteFilePath: string;
	fileName: string;
	contents: JSONDocNode;
	pageTitle: string;
	frontmatter: {
		[key: string]: unknown;
	};
	tags: string[];
	dontChangeParentPageId: boolean;

	pageId: string;
	spaceKey: string;
}

export interface ConfluenceNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string,
	existingAdf: string;
	parentPageId: string;
}
export interface ConfluenceTreeNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string,
	existingAdf: string;
	children: ConfluenceTreeNode[];
}

export interface UploadAdfFileResult {
	adfFile: ConfluenceAdfFile;
	contentResult: "same" | "updated";
	imageResult: "same" | "updated";
	labelResult: "same" | "updated";
}

export class Publisher {
	confluenceClient: CustomConfluenceClient;
	adaptor: LoaderAdaptor;
	settings: ConfluenceSettings;
	mermaidRenderer: MermaidRenderer;
	myAccountId: string | undefined;

	constructor(
		adaptor: LoaderAdaptor,
		settings: ConfluenceSettings,
		confluenceClient: CustomConfluenceClient,
		mermaidRenderer: MermaidRenderer
	) {
		this.adaptor = adaptor;
		this.settings = settings;
		this.mermaidRenderer = mermaidRenderer;

		this.confluenceClient = confluenceClient;
	}

	async publish(publishFilter?: string) {
		if(!this.myAccountId) {
			const currentUser = await this.confluenceClient.users.getCurrentUser();
			this.myAccountId = currentUser.accountId;
		}

		const parentPage = await this.confluenceClient.content.getContentById({
			id: this.settings.confluenceParentId,
			expand: ["body.atlas_doc_format", "space"],
		});
		if (!parentPage.space) {
			throw new Error("Missing Space Key");
		}

		const spaceToPublishTo = parentPage.space;

		const files = await this.adaptor.getMarkdownFilesToUpload();
		const folderTree = createLocalAdfTree(files);
		let confluencePagesToPublish = await ensureAllFilesExistInConfluence(
			this.confluenceClient,
			this.adaptor,
			folderTree,
			spaceToPublishTo.key,
			parentPage.id,
			parentPage.id
		);

		prepareAdf(confluencePagesToPublish, this.settings);

		if (publishFilter) {
			confluencePagesToPublish = confluencePagesToPublish.filter(
				(file) => file.file.absoluteFilePath === publishFilter
			);
		}

		const adrFileTasks = confluencePagesToPublish.map((file) => {
			return this.publishFile(file);
		});

		const adrFiles = await Promise.all(adrFileTasks);
		return adrFiles;
	}

	async doPublish(publishFilter?: string): Promise<UploadResults> {
		const adrFiles = await this.publish(publishFilter);

		const returnVal: UploadResults = {
			errorMessage: null,
			failedFiles: [],
			filesUploadResult: [],
		};

		adrFiles.forEach((element) => {
			if (element.successfulUploadResult) {
				returnVal.filesUploadResult.push(
					element.successfulUploadResult
				);
				return;
			}

			returnVal.failedFiles.push({
				fileName: element.node.file.absoluteFilePath,
				reason: element.reason ?? "No Reason Provided",
			});
		});

		return returnVal;
	}

	private async publishFile(
		node: ConfluenceNode
	): Promise<FilePublishResult> {
		try {
			const successfulUploadResult = await this.updatePageContent(
				node.parentPageId,
				node.version,
				node.existingAdf,
				node.file,
				node.lastUpdatedBy,
			);

			return {
				node,
				successfulUploadResult,
			};
		} catch (e: unknown) {
			if (e instanceof Error) {
				return {
					node,
					reason: e.message,
				};
			}

			return {
				node,
				reason: JSON.stringify(e), // TODO: Understand why this doesn't show error message properly
			};
		}
	}

	private async updatePageContent(
		parentPageId: string,
		pageVersionNumber: number,
		currentContents: string,
		adfFile: ConfluenceAdfFile,
		lastUpdatedBy: string,
	): Promise<UploadAdfFileResult> {
		if (lastUpdatedBy !== this.myAccountId) {
			throw new Error(`Page last updated by another user. Won't publish over their changes. MyAccountId: ${this.myAccountId}, Last Updated By: ${lastUpdatedBy}`);
		}

		const result: UploadAdfFileResult = {
			adfFile,
			contentResult: "same",
			imageResult: "same",
			labelResult: "same",
		};
		const updatedAdf = await this.uploadFiles(
			adfFile.pageId,
			adfFile.absoluteFilePath,
			adfFile.contents
		);

		if (!adfEqual(adfFile.contents, updatedAdf)) {
			result.imageResult = "updated";
		}

		const adr = JSON.stringify(updatedAdf);

		if (!adfEqual(JSON.parse(currentContents), updatedAdf)) {
			result.contentResult = "updated";
			console.log("TESTING DIFF");
			console.log(currentContents);
			console.log(adr);

			const updateContentDetails = {
				id: adfFile.pageId,
				...(adfFile.dontChangeParentPageId
					? {}
					: { ancestors: [{ id: parentPageId }] }),
				version: { number: pageVersionNumber + 1 },
				title: adfFile.pageTitle,
				type: "page",
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: adr,
						representation: "atlas_doc_format",
					},
				},
			};
			await this.confluenceClient.content.updateContent(
				updateContentDetails
			);
		}

		const getLabelsForContent = {
			id: adfFile.pageId,
		};
		const currentLabels =
			await this.confluenceClient.contentLabels.getLabelsForContent(
				getLabelsForContent
			);

		for (const existingLabel of currentLabels.results) {
			if (!adfFile.tags.includes(existingLabel.label)) {
				result.labelResult = "updated";
				await this.confluenceClient.contentLabels.removeLabelFromContentUsingQueryParameter(
					{
						id: adfFile.pageId,
						name: existingLabel.name,
					}
				);
			}
		}

		const labelsToAdd = [];
		for (const newLabel of adfFile.tags) {
			if (
				currentLabels.results.findIndex(
					(item) => item.label === newLabel
				) === -1
			) {
				labelsToAdd.push({
					prefix: "global",
					name: newLabel,
				});
			}
		}

		if (labelsToAdd.length > 0) {
			result.labelResult = "updated";
			await this.confluenceClient.contentLabels.addLabelsToContent({
				id: adfFile.pageId,
				body: labelsToAdd,
			});
		}

		return result;
	}

	private async uploadFiles(
		pageId: string,
		pageFilePath: string,
		adr: JSONDocNode
	): Promise<JSONDocNode> {
		const mediaNodes = filter(
			adr,
			(node) =>
				node.type === "media" && (node.attrs || {})?.type === "file"
		);

		const mermaidNodes = filter(
			adr,
			(node) =>
				node.type == "codeBlock" &&
				(node.attrs || {})?.language === "mermaid"
		);

		const mermaidNodesToUpload = new Set(
			mermaidNodes.map((node) => {
				const mermaidDetails = getMermaidFileName(
					node?.content?.at(0)?.text
				);
				return {
					name: mermaidDetails.uploadFilename,
					data: mermaidDetails.mermaidText,
				} as ChartData;
			})
		).values();

		const mermaidChartsAsImages =
			await this.mermaidRenderer.captureMermaidCharts([
				...mermaidNodesToUpload,
			]);

		const imagesToUpload = new Set(
			mediaNodes.map((node) => node?.attrs?.url)
		);

		if (imagesToUpload.size === 0 && mermaidChartsAsImages.size === 0) {
			return adr;
		}

		const currentUploadedAttachments =
			await this.confluenceClient.contentAttachments.getAttachments({
				id: pageId,
			});

		const currentAttachments = currentUploadedAttachments.results.reduce(
			(prev, curr) => {
				return {
					...prev,
					[`${curr.title}`]: {
						filehash: curr.metadata.comment,
						attachmentId: curr.extensions.fileId,
						collectionName: curr.extensions.collectionName,
					},
				};
			},
			{}
		);

		let imageMap: Record<string, UploadedImageData | null> = {};

		for (const imageUrl of imagesToUpload.values()) {
			const filename = imageUrl.split("://")[1];
			const uploadedContent = await uploadFile(
				this.confluenceClient,
				this.adaptor,
				pageId,
				pageFilePath,
				filename,
				currentAttachments
			);

			imageMap = {
				...imageMap,
				[imageUrl]: uploadedContent,
			};
		}

		for (const mermaidImage of mermaidChartsAsImages) {
			const uploadedContent = await uploadBuffer(
				this.confluenceClient,
				pageId,
				mermaidImage[0],
				mermaidImage[1],
				currentAttachments
			);

			imageMap = {
				...imageMap,
				[mermaidImage[0]]: uploadedContent,
			};
		}

		const afterAdf = traverse(adr, {
			media: (node, _parent) => {
				if (node?.attrs?.type === "file") {
					if (!imageMap[node?.attrs?.url]) {
						return;
					}
					const mappedImage = imageMap[node.attrs.url];
					if (mappedImage !== null) {
						node.attrs.collection = mappedImage.collection;
						node.attrs.id = mappedImage.id;
						delete node.attrs.url;
						return node;
					}
				}
			},
			codeBlock: (node, _parent) => {
				if (node?.attrs?.language === "mermaid") {
					const mermaidContent = node?.content?.at(0)?.text;
					if (!mermaidContent) {
						return;
					}
					const mermaidFilename = getMermaidFileName(mermaidContent);

					if (!imageMap[mermaidFilename.uploadFilename]) {
						return;
					}
					const mappedImage =
						imageMap[mermaidFilename.uploadFilename];
					if (mappedImage !== null) {
						node.type = "mediaSingle";
						node.attrs.layout = "center";
						if (node.content) {
							node.content = [
								{
									type: "media",
									attrs: {
										type: "file",
										collection: mappedImage.collection,
										id: mappedImage.id,
									},
								},
							];
						}
						delete node.attrs.language;
						return node;
					}
				}
			},
		});

		if (!afterAdf) {
			return adr;
		}

		return afterAdf as JSONDocNode;
	}
}
