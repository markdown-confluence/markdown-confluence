import { MyPluginSettings } from "./Settings";
import FolderFile from "./FolderFile.json";

import { traverse, filter } from "@atlaskit/adf-utils/traverse";
import * as SparkMD5 from "spark-md5";
import { doc, p } from "@atlaskit/adf-utils/builders";
import { ADFEntity } from "@atlaskit/adf-utils/types";
import MdToADF from "./mdToADF";
import {
	ConfluenceClient,
	LoaderAdaptor,
	MarkdownFile,
} from "./adaptors/types";

export class Publisher {
	confluenceClient: ConfluenceClient;
	blankPageAdf: string = JSON.stringify(doc(p("Blank page to replace")));
	frontmatterRegex = /^\s*?---\n([\s\S]*?)\n---/g;
	mdToADFConverter: MdToADF;
	adaptor: LoaderAdaptor;
	settings: MyPluginSettings;

	constructor(
		adaptor: LoaderAdaptor,
		settings: MyPluginSettings,
		confluenceClient: ConfluenceClient
	) {
		this.adaptor = adaptor;
		this.settings = settings;

		this.mdToADFConverter = new MdToADF();

		this.confluenceClient = confluenceClient;
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
		let markdown = file.contents.replace(this.frontmatterRegex, "");

		if (
			file.frontmatter["frontmatter-to-publish"] &&
			Array.isArray(file.frontmatter["frontmatter-to-publish"])
		) {
			console.log({
				fmtopub: file.frontmatter["frontmatter-to-publish"],
			});
			let frontmatterHeader = "| Key | Value | \n | ----- | ----- |\n";
			for (const key of file.frontmatter["frontmatter-to-publish"]) {
				if (file.frontmatter[key]) {
					const keyString = key.toString();
					const valueString = file.frontmatter[key].toString();
					frontmatterHeader += `| ${keyString} | ${valueString} |\n`;
				}
			}
			markdown = frontmatterHeader + markdown;
		}

		const tags = [];
		if (
			file.frontmatter["tags"] &&
			Array.isArray(file.frontmatter["tags"])
		) {
			for (const label of file.frontmatter["tags"]) {
				if (typeof label === "string") {
					tags.push(label);
				}
			}
		}

		const adrobj = this.mdToADFConverter.parse(markdown);

		const searchParams = {
			type: "page",
			spaceKey,
			title: file.pageTitle,
			expand: ["version", "body.atlas_doc_format", "body.storage"],
		};
		const contentByTitle = await this.confluenceClient.content.getContent(
			searchParams
		);

		if (contentByTitle.size > 0) {
			const currentPage = contentByTitle.results[0];

			console.log("BEFORE CURRENT ADF");
			console.log(
				JSON.stringify(currentPage?.body?.atlas_doc_format?.value)
			);
			console.log("AFTER CURRENT ADF");

			await this.updatePageContent(
				currentPage.id,
				file.absoluteFilePath,
				adrobj,
				parentPageId,
				currentPage!.version!.number,
				file.pageTitle,
				currentPage?.body?.atlas_doc_format?.value ?? "",
				tags
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

			await this.updatePageContent(
				pageDetails.id,
				file.absoluteFilePath,
				adrobj,
				parentPageId,
				pageDetails!.version!.number,
				file.pageTitle,
				pageDetails?.body?.atlas_doc_format?.value ?? "",
				tags
			);
		}

		return true;
	}

	async updatePageContent(
		pageId: string,
		originFileAbsoluteFilePath: string,
		adf: ADFEntity,
		parentPageId: string,
		pageVersionNumber: number,
		pageTitle: string,
		currentContents: string,
		labels: string[]
	) {
		const updatedAdf = await this.uploadFiles(
			pageId,
			originFileAbsoluteFilePath,
			adf
		);

		const adr = JSON.stringify(updatedAdf);

		console.log("TESTING DIFF");
		console.log(currentContents);
		console.log(adr);

		if (currentContents === adr) {
			console.log("Page is the same not updating");
			return true;
		}

		const updateContentDetails = {
			id: pageId,
			ancestors: [{ id: parentPageId }],
			version: { number: pageVersionNumber + 1 },
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
		await this.confluenceClient.content.updateContent(updateContentDetails);
		const getLabelsForContent = {
			id: pageId,
		};
		const currentLabels =
			await this.confluenceClient.contentLabels.getLabelsForContent(
				getLabelsForContent
			);
		if (currentLabels.size > 0) {
			console.log({ currentLabels });
		}

		for (const existingLabel of currentLabels.results) {
			if (!labels.includes(existingLabel.label)) {
				await this.confluenceClient.contentLabels.removeLabelFromContentUsingQueryParameter(
					{
						id: pageId,
						name: existingLabel.name,
					}
				);
			}
		}

		const labelsToAdd = [];
		for (const newLabel of labels) {
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
			await this.confluenceClient.contentLabels.addLabelsToContent({
				id: pageId,
				body: labelsToAdd,
			});
		}
	}

	async uploadFiles(
		pageId: string,
		pageFilePath: string,
		adr: ADFEntity
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
