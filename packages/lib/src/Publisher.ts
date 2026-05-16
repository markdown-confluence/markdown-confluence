import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { Effect, Layer } from "effect";
import { AlwaysADFProcessingPlugins } from "./ADFProcessingPlugins";
import {
	ADFProcessingPlugin,
	createPublisherFunctions,
	executeADFProcessingPipelineEffect,
	PublisherFunctions,
} from "./ADFProcessingPlugins/types";
import { adfEqual } from "./AdfEqual";
import { CurrentAttachments, UploadedImageData } from "./Attachments";
import { PageContentType } from "./ConniePageConfig";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { createMissingSpaceKeyError } from "./ConfluenceErrors";
import { MarkdownConfluencePlatform, runEffect } from "./effects";
import { MarkdownWorkspaceLive, MarkdownWorkspaceService } from "./MarkdownWorkspace";
import { ConfluenceSettings, ConfluenceSettingsService } from "./Settings";
import { ensureAllFilesExistInConfluenceEffect } from "./TreeConfluence";
import { createFolderStructureEffect as createLocalAdfTreeEffect } from "./TreeLocal";
import { isEqual } from "./isEqual";

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
	contentType: PageContentType;
	blogPostDate: string | undefined;
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
	pageUrl: string;

	contentType: PageContentType;
	blogPostDate: string | undefined;
}

interface ConfluencePageExistingData {
	adfContent: JSONDocNode;
	pageTitle: string;
	ancestors: { id: string }[];
	contentType: string;
}

export interface ConfluenceNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingPageData: ConfluencePageExistingData;
	ancestors: string[];
}

export interface ConfluenceTreeNode {
	file: ConfluenceAdfFile;
	version: number;
	lastUpdatedBy: string;
	existingPageData: ConfluencePageExistingData;
	children: ConfluenceTreeNode[];
}

export interface UploadAdfFileResult {
	adfFile: ConfluenceAdfFile;
	contentResult: "same" | "updated";
	imageResult: "same" | "updated";
	labelResult: "same" | "updated";
}

export class Publisher {
	private confluenceClient: RequiredConfluenceClient;
	private myAccountId: string | undefined;
	private settings: ConfluenceSettings;
	private adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[];

	constructor(
		settings: ConfluenceSettings,
		confluenceClient: RequiredConfluenceClient,
		adfProcessingPlugins: ADFProcessingPlugin<unknown, unknown>[],
	) {
		this.settings = settings;

		this.confluenceClient = confluenceClient;
		this.adfProcessingPlugins = adfProcessingPlugins.concat(AlwaysADFProcessingPlugins);
	}

	publish(publishFilter?: string): Promise<FilePublishResult[]> {
		return runEffect(
			this.publishEffect(publishFilter).pipe(
				Effect.provide(MarkdownWorkspaceLive),
				Effect.provide(Layer.succeed(ConfluenceSettingsService, this.settings)),
			),
		);
	}

	publishEffect(
		publishFilter?: string,
	): Effect.Effect<
		FilePublishResult[],
		unknown,
		MarkdownConfluencePlatform | MarkdownWorkspaceService
	> {
		const settings = this.settings;
		const confluenceClient = this.confluenceClient;
		const getMyAccountId = () => this.myAccountId;
		const setMyAccountId = (accountId: string) => {
			this.myAccountId = accountId;
		};
		const publishFileEffect = this.publishFileEffect.bind(this);

		return Effect.gen(function* () {
			if (!getMyAccountId()) {
				const currentUser = yield* Effect.tryPromise({
					try: () => confluenceClient.users.getCurrentUser(),
					catch: identity,
				});
				setMyAccountId(currentUser.accountId);
			}

			const parentPage = yield* Effect.tryPromise({
				try: () =>
					confluenceClient.content.getContentById({
						id: settings.confluenceParentId,
						expand: ["body.atlas_doc_format", "space"],
					}),
				catch: identity,
			});
			if (!parentPage.space?.key) {
				return yield* Effect.fail(
					createMissingSpaceKeyError(
						settings.confluenceParentId,
						settings.confluenceBaseUrl,
					),
				);
			}

			const spaceToPublishTo = parentPage.space;

			const workspace = yield* MarkdownWorkspaceService;
			const files = yield* workspace.getMarkdownFilesToUpload;
			const folderTree = yield* createLocalAdfTreeEffect(files, settings);
			let confluencePagesToPublish = yield* ensureAllFilesExistInConfluenceEffect(
				confluenceClient,
				folderTree,
				spaceToPublishTo.key,
				parentPage.id,
				parentPage.id,
				settings,
			);

			if (publishFilter) {
				confluencePagesToPublish = confluencePagesToPublish.filter(
					(file) => file.file.absoluteFilePath === publishFilter,
				);
			}

			return yield* Effect.all(
				confluencePagesToPublish.map((file) => publishFileEffect(file)),
				{ concurrency: "unbounded" },
			);
		});
	}

	private publishFileEffect(
		node: ConfluenceNode,
	): Effect.Effect<
		FilePublishResult,
		never,
		MarkdownConfluencePlatform | MarkdownWorkspaceService
	> {
		return this.updatePageContentEffect(
			node.ancestors,
			node.version,
			node.existingPageData,
			node.file,
			node.lastUpdatedBy,
		).pipe(
			Effect.map((successfulUploadResult) => ({
				node,
				successfulUploadResult,
			})),
			Effect.catch((e: unknown) =>
				Effect.succeed({
					node,
					reason: e instanceof Error ? e.message : JSON.stringify(e),
				}),
			),
		);
	}

	private updatePageContentEffect(
		ancestors: string[],
		pageVersionNumber: number,
		existingPageData: ConfluencePageExistingData,
		adfFile: ConfluenceAdfFile,
		lastUpdatedBy: string,
	): Effect.Effect<
		UploadAdfFileResult,
		unknown,
		MarkdownConfluencePlatform | MarkdownWorkspaceService
	> {
		const confluenceClient = this.confluenceClient;
		const adfProcessingPlugins = this.adfProcessingPlugins;
		const getMyAccountId = () => this.myAccountId;

		return Effect.gen(function* () {
			if (lastUpdatedBy !== getMyAccountId()) {
				return yield* Effect.fail(
					new Error(
						`Page last updated by another user. Won't publish over their changes. MyAccountId: ${getMyAccountId()}, Last Updated By: ${lastUpdatedBy}`,
					),
				);
			}
			if (existingPageData.contentType !== adfFile.contentType) {
				return yield* Effect.fail(
					new Error(
						`Cannot convert between content types. From ${existingPageData.contentType} to ${adfFile.contentType}`,
					),
				);
			}

			const result: UploadAdfFileResult = {
				adfFile,
				contentResult: "same",
				imageResult: "same",
				labelResult: "same",
			};

			const currentUploadedAttachments = yield* Effect.tryPromise({
				try: () =>
					confluenceClient.contentAttachments.getAttachments({
						id: adfFile.pageId,
					}),
				catch: identity,
			});

			const currentAttachments: CurrentAttachments =
				currentUploadedAttachments.results.reduce((prev, curr) => {
					return {
						...prev,
						[`${curr.title}`]: {
							filehash: curr.metadata.comment,
							attachmentId: curr.extensions.fileId,
							collectionName: curr.extensions.collectionName,
						},
					};
				}, {});

			const workspace = yield* MarkdownWorkspaceService;
			let processedAttachment = false;
			const supportFunctions = trackProcessedAttachments(
				createPublisherFunctions(
					confluenceClient,
					workspace,
					adfFile.pageId,
					adfFile.absoluteFilePath,
					currentAttachments,
				),
				(uploaded) => {
					if (uploaded) {
						processedAttachment = true;
					}
				},
			);
			const adfToUpload = yield* executeADFProcessingPipelineEffect(
				adfProcessingPlugins,
				adfFile.contents,
				supportFunctions,
			);

			if (processedAttachment) {
				result.imageResult = "updated";
			}

			const existingPageDetails = {
				title: existingPageData.pageTitle,
				type: existingPageData.contentType,
				...(adfFile.contentType === "blogpost" || adfFile.dontChangeParentPageId
					? {}
					: { ancestors: existingPageData.ancestors }),
			};

			const newPageDetails = {
				title: adfFile.pageTitle,
				type: adfFile.contentType,
				...(adfFile.contentType === "blogpost" || adfFile.dontChangeParentPageId
					? {}
					: {
							ancestors: ancestors.map((ancestor) => ({
								id: ancestor,
							})),
						}),
			};

			if (
				!adfEqual(existingPageData.adfContent, adfToUpload) ||
				!isEqual(existingPageDetails, newPageDetails)
			) {
				result.contentResult = "updated";
				const updateContentDetails = {
					...newPageDetails,
					id: adfFile.pageId,
					version: { number: pageVersionNumber + 1 },
					body: {
						// eslint-disable-next-line @typescript-eslint/naming-convention
						atlas_doc_format: {
							value: JSON.stringify(adfToUpload),
							representation: "atlas_doc_format",
						},
					},
				};
				yield* Effect.tryPromise({
					try: () => confluenceClient.content.updateContent(updateContentDetails),
					catch: identity,
				});
			}

			const getLabelsForContent = {
				id: adfFile.pageId,
			};
			const currentLabels = yield* Effect.tryPromise({
				try: () => confluenceClient.contentLabels.getLabelsForContent(getLabelsForContent),
				catch: identity,
			});

			for (const existingLabel of currentLabels.results) {
				if (!adfFile.tags.includes(existingLabel.label)) {
					result.labelResult = "updated";
					yield* Effect.tryPromise({
						try: () =>
							confluenceClient.contentLabels.removeLabelFromContentUsingQueryParameter(
								{
									id: adfFile.pageId,
									name: existingLabel.name,
								},
							),
						catch: identity,
					});
				}
			}

			const labelsToAdd: { prefix: string; name: string }[] = [];
			for (const newLabel of adfFile.tags) {
				if (currentLabels.results.findIndex((item) => item.label === newLabel) === -1) {
					labelsToAdd.push({
						prefix: "global",
						name: newLabel,
					});
				}
			}

			if (labelsToAdd.length > 0) {
				result.labelResult = "updated";
				yield* Effect.tryPromise({
					try: () =>
						confluenceClient.contentLabels.addLabelsToContent({
							id: adfFile.pageId,
							body: labelsToAdd,
						}),
					catch: identity,
				});
			}

			return result;
		});
	}
}

function trackProcessedAttachments(
	supportFunctions: PublisherFunctions,
	onProcessedAttachment: (uploaded: UploadedImageData | null) => void,
): PublisherFunctions {
	return {
		...supportFunctions,
		uploadFile: async (fileNameToUpload) => {
			const uploaded = await supportFunctions.uploadFile(fileNameToUpload);
			onProcessedAttachment(uploaded);
			return uploaded;
		},
		uploadFileEffect: (fileNameToUpload) =>
			supportFunctions
				.uploadFileEffect(fileNameToUpload)
				.pipe(Effect.tap((uploaded) => Effect.sync(() => onProcessedAttachment(uploaded)))),
		uploadBuffer: async (uploadFilename, fileBuffer, contentType) => {
			const uploaded = await supportFunctions.uploadBuffer(
				uploadFilename,
				fileBuffer,
				contentType,
			);
			onProcessedAttachment(uploaded);
			return uploaded;
		},
		uploadBufferEffect: (uploadFilename, fileBuffer, contentType) =>
			supportFunctions
				.uploadBufferEffect(uploadFilename, fileBuffer, contentType)
				.pipe(Effect.tap((uploaded) => Effect.sync(() => onProcessedAttachment(uploaded)))),
	};
}

function identity(error: unknown): unknown {
	return error;
}
