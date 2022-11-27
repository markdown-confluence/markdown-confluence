import { CustomConfluenceClient } from "./MyBaseClient";
import { MyPluginSettings } from "./Settings";
import FolderFile from "./FolderFile.json";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";

import { traverse, filter } from "@atlaskit/adf-utils/traverse";
import * as SparkMD5 from "spark-md5";
import { doc, p } from "@atlaskit/adf-utils/builders";
import { ADFEntity } from "@atlaskit/adf-utils/types";
import MdToADF from "./mdToADF";
import ObsidianAdaptor from "./adaptors/obsidian";
import { LoaderAdaptor, MarkdownFile } from "./adaptors/types";

export class Publisher {
	confluenceClient: CustomConfluenceClient;
	blankPageAdf: string = JSON.stringify(doc(p("Blank page to replace")));
	mdToADFConverter: MdToADF;
	adaptor: ObsidianAdaptor;
	settings: MyPluginSettings;

	constructor(vault: LoaderAdaptor, settings: MyPluginSettings) {
		this.settings = settings;

		this.mdToADFConverter = new MdToADF();

		this.confluenceClient = new CustomConfluenceClient({
			host: settings.confluenceBaseUrl,
			authentication: {
				basic: {
					email: settings.atlassianUserName,
					apiToken: settings.atlassianApiToken,
				},
			},
		});
	}

	async doPublish(): Promise<{ successes: number; failures: number }> {
		const parentPage = await this.confluenceClient.content.getContentById({
			id: this.settings.confluenceParentId,
			expand: ["body.atlas_doc_format", "space"],
		});
		const spaceToPublishTo = parentPage.space;
		console.log({ parentPage });

		const files = await this.adaptor.getMarkdownFilesToUpload();
		//TODO: Create fake file to publish
		//TODO: Handle finding root folder

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

		return stats;
	}

	async publishFile(
		file: MarkdownFile,
		spaceKey: string,
		parentPageId: string
	): Promise<boolean> {
		if (file.pageTitle !== "Testing2") {
			return false;
		}

		const adrobj = this.mdToADFConverter.parse(file.contents);

		const searchParams = {
			type: "page",
			spaceKey,
			title: file.pageTitle,
			expand: ["version", "body.atlas_doc_format"],
		};
		const contentByTitle = await this.confluenceClient.content.getContent(
			searchParams
		);

		if (contentByTitle.size > 0) {
			const currentPage = contentByTitle.results[0];

			const updatedAdr = await this.uploadFiles(
				currentPage.id,
				file.absoluteFilePath,
				adrobj
			);
			const adr = JSON.stringify(updatedAdr);

			if (currentPage?.body?.atlas_doc_format?.value === adr) {
				console.log("Page is the same not updating");
				return true;
			}

			console.log("Updating page", { currentPage });

			const updateContentDetails = {
				id: currentPage.id,
				ancestors: [{ id: parentPageId }],
				version: { number: (currentPage?.version?.number ?? 1) + 1 },
				title: file.pageTitle,
				type: "page",
				body: {
					atlas_doc_format: {
						value: adr,
						representation: "atlas_doc_format",
					},
				},
			};
			console.log({ updateContentDetails });

			await this.confluenceClient.content.updateContent(
				updateContentDetails
			);
		} else {
			console.log("Creating page");
			const creatingBlankPageRequest = {
				space: { key: spaceKey },
				ancestors: [{ id: parentPageId }],
				title: file.pageTitle,
				type: "page",
				body: {
					atlas_doc_format: {
						value: this.blankPageAdf,
						representation: "atlas_doc_format",
					},
				},
			};
			const pageDetails =
				await this.confluenceClient.content.createContent(
					creatingBlankPageRequest
				);

			const updatedAdr = await this.uploadFiles(
				pageDetails.id,
				file.absoluteFilePath,
				adrobj
			);

			const adr = JSON.stringify(updatedAdr);
			const updateContentDetails = {
				id: pageDetails.id,
				ancestors: [{ id: parentPageId }],
				version: { number: (pageDetails?.version?.number ?? 1) + 1 },
				title: file.pageTitle,
				type: "page",
				body: {
					atlas_doc_format: {
						value: adr,
						representation: "atlas_doc_format",
					},
				},
			};
			console.log({ updateContentDetails });
			await this.confluenceClient.content.updateContent(
				updateContentDetails
			);
		}

		return true;
	}

	async uploadFiles(
		pageId: string,
		pageFilePath: string,
		adr: JSONDocNode
	): Promise<false | ADFEntity> {
		const mediaNodes = filter(
			adr,
			(node) =>
				node.type === "media" && (node.attrs || {})?.type === "file"
		);

		const currentUploadedAttachments =
			await this.confluenceClient.contentAttachments.getAttachments({
				id: pageId,
			});
		console.log({ currentUploadedAttachments });
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

		console.log({ mediaNodes, currentAttachments });

		const imagesToUpload = new Set(
			mediaNodes.map((node) => node?.attrs?.url)
		).values();

		let imageMap: Record<string, UploadedImageData> = {};

		for (const imageUrl of imagesToUpload) {
			console.log({ testing: imageUrl });
			const filename = imageUrl.split(":")[1];
			const uploadedContent = await this.uploadFile(
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
		console.log({ beforeAdr: adr });

		const afterAdf = traverse(adr, {
			media: (node, parent) => {
				if (node?.attrs?.type === "file") {
					console.log({ node });
					if (!imageMap[node?.attrs?.url]) {
						return;
					}
					const mappedImage = imageMap[node.attrs.url];
					node.attrs.collection = mappedImage.collection;
					node.attrs.id = mappedImage.id;
					delete node.attrs.url;
					console.log({ node });
				}
			},
		});

		console.log({ afterAdr: afterAdf });

		return afterAdf;
	}

	async uploadFile(
		pageId: string,
		pageFilePath: string,
		fileNameToUpload: string,
		currentAttachments: Record<
			string,
			{ filehash: string; attachmentId: string; collectionName: string }
		>
	): Promise<UploadedImageData | null> {
		console.log("UPLOAD FILE FUNCTION", fileNameToUpload);
		const testing = await this.adaptor.readBinary(
			fileNameToUpload,
			pageFilePath
		);
		if (!!testing) {
			const spark = new SparkMD5.ArrayBuffer();
			const currentFileMd5 = spark.append(testing.contents).end();
			const pathMd5 = SparkMD5.hash(testing.filePath);
			const uploadFilename = `${pathMd5}-${testing.filename}`;

			if (
				!!currentAttachments[uploadFilename] &&
				currentAttachments[uploadFilename].filehash === currentFileMd5
			) {
				console.log("FILE ALREADY UPLOADED");
				console.log({
					fileDetails: currentAttachments[uploadFilename],
				});
				return {
					filename: fileNameToUpload,
					id: currentAttachments[uploadFilename].attachmentId,
					collection:
						currentAttachments[uploadFilename].collectionName,
				};
			}

			const attachmentDetails = {
				id: pageId,
				attachments: [
					{
						file: new Blob([testing.contents], {
							type: testing.mimeType,
						}),
						filename: uploadFilename,
						minorEdit: false,
						comment: currentFileMd5,
					},
				],
			};

			console.log({ testing, attachmentDetails });
			const attachmentResponse =
				await this.confluenceClient.contentAttachments.createOrUpdateAttachments(
					attachmentDetails
				);

			console.log({ attachmentReponse: attachmentResponse.results[0] });
			return {
				filename: fileNameToUpload,
				id: attachmentResponse.results[0].extensions.fileId,
				collection: `contentId-${attachmentResponse.results[0].container.id}`,
			};
		}

		return null;
	}
}

interface UploadedImageData {
	filename: string;
	id: string;
	collection: string;
}
