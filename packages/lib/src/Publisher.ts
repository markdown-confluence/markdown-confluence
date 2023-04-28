import { ConfluenceSettings, SettingsLoader } from "./Settings";
import { traverse, filter } from "@atlaskit/adf-utils/traverse";
import { RequiredConfluenceClient, LoaderAdaptor } from "./adaptors";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { createFolderStructure as createLocalAdfTree } from "./TreeLocal";
import { ensureAllFilesExistInConfluence } from "./TreeConfluence";
import { uploadBuffer, UploadedImageData, uploadFile } from "./Attachments";
import { adfEqual } from "./AdfEqual";
import {
	getMermaidFileName,
	MermaidRenderer,
	ChartData,
} from "./mermaid_renderers";
import { PageContentType } from "./ConniePageConfig";
import { p } from "@atlaskit/adf-utils/builders";
import { ADFEntity } from "@atlaskit/adf-utils/dist/types/types";

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
	pageId?: string;
	dontChangeParentPageId: boolean;
	contentType: PageContentType;
	blogPostDate?: string;
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

	contentType: PageContentType;
	blogPostDate?: string;
}

export interface ConfluenceNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingAdf: JSONDocNode;
	parentPageId: string;
}
export interface ConfluenceTreeNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingAdf: JSONDocNode;
	children: ConfluenceTreeNode[];
}

export interface UploadAdfFileResult {
	adfFile: ConfluenceAdfFile;
	contentResult: "same" | "updated";
	imageResult: "same" | "updated";
	labelResult: "same" | "updated";
}

export class Publisher {
	confluenceClient: RequiredConfluenceClient;
	adaptor: LoaderAdaptor;
	settings: ConfluenceSettings;
	mermaidRenderer: MermaidRenderer;
	myAccountId: string | undefined;
	settingsLoader: SettingsLoader;

	constructor(
		adaptor: LoaderAdaptor,
		settingsLoader: SettingsLoader,
		confluenceClient: RequiredConfluenceClient,
		mermaidRenderer: MermaidRenderer
	) {
		this.adaptor = adaptor;
		this.settingsLoader = settingsLoader;
		this.mermaidRenderer = mermaidRenderer;

		this.confluenceClient = confluenceClient;
	}

	async publish(publishFilter?: string) {
		this.settings = this.settingsLoader.load();

		if (!this.myAccountId) {
			const currentUser =
				await this.confluenceClient.users.getCurrentUser();
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
			parentPage.id,
			this.settings
		);

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
				node.lastUpdatedBy
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
		currentContents: JSONDocNode,
		adfFile: ConfluenceAdfFile,
		lastUpdatedBy: string
	): Promise<UploadAdfFileResult> {
		if (lastUpdatedBy !== this.myAccountId) {
			throw new Error(
				`Page last updated by another user. Won't publish over their changes. MyAccountId: ${this.myAccountId}, Last Updated By: ${lastUpdatedBy}`
			);
		}

		const result: UploadAdfFileResult = {
			adfFile,
			contentResult: "same",
			imageResult: "same",
			labelResult: "same",
		};
		const imageUploadResult = await this.uploadFiles(
			adfFile.pageId,
			adfFile.absoluteFilePath,
			adfFile.contents
		);

		const imageResult = Object.keys(imageUploadResult.imageMap).reduce(
			(prev, curr) => {
				const value = imageUploadResult.imageMap[curr];
				if (value === null) {
					return prev;
				}
				const status = value.status;
				return {
					...prev,
					[status]: prev[status] + 1,
				};
			},
			{
				existing: 0,
				uploaded: 0,
			} as Record<string, number>
		);

		if (!adfEqual(adfFile.contents, imageUploadResult.adf)) {
			result.imageResult =
				imageResult["uploaded"] > 0 ? "updated" : "same";
		}

		if (!adfEqual(currentContents, imageUploadResult.adf)) {
			result.contentResult = "updated";
			console.log(`TESTING DIFF - ${adfFile.absoluteFilePath}`);

			const replacer = (key: unknown, value: unknown) =>
				typeof value === "undefined" ? null : value;

			console.log(JSON.stringify(currentContents, replacer));
			console.log(JSON.stringify(imageUploadResult.adf, replacer));

			const updateContentDetails = {
				id: adfFile.pageId,
				...(adfFile.contentType === "blogpost" ||
				adfFile.dontChangeParentPageId
					? {}
					: { ancestors: [{ id: parentPageId }] }),
				version: { number: pageVersionNumber + 1 },
				title: adfFile.pageTitle,
				type: adfFile.contentType,
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: JSON.stringify(imageUploadResult.adf),
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
	): Promise<{
		adf: JSONDocNode;
		imageMap: Record<string, UploadedImageData | null>;
	}> {
		let imageMap: Record<string, UploadedImageData | null> = {};

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
			return { adf: adr, imageMap };
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

		let afterAdf = adr as ADFEntity;

		afterAdf =
			traverse(adr, {
				media: (node, _parent) => {
					if (node?.attrs?.type === "file") {
						if (!imageMap[node?.attrs?.url]) {
							return;
						}
						const mappedImage = imageMap[node.attrs.url];
						if (mappedImage !== null) {
							node.attrs.collection = mappedImage.collection;
							node.attrs.id = mappedImage.id;
							node.attrs.width = mappedImage.width;
							node.attrs.height = mappedImage.height;
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
						const mermaidFilename =
							getMermaidFileName(mermaidContent);

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
											width: mappedImage.width,
											height: mappedImage.height,
										},
									},
								];
							}
							delete node.attrs.language;
							return node;
						}
					}
				},
			}) || afterAdf;

		// Remove bad images. Confluence will do this as well so we do it to make our ADF match theirs.
		afterAdf =
			traverse(afterAdf, {
				mediaSingle: (node, _parent) => {
					if (!node || !node.content) {
						return;
					}
					if (
						node.content.at(0)?.attrs?.url !== undefined &&
						(node.content.at(0)?.attrs?.url as string).startsWith(
							"file://"
						)
					) {
						return p("Invalid Image Path");
					}
				},
			}) || afterAdf;

		if (!afterAdf) {
			return { adf: adr as JSONDocNode, imageMap };
		}

		return { adf: afterAdf as JSONDocNode, imageMap };
	}
}
