import SparkMD5 from "spark-md5";
import { CustomConfluenceClient, LoaderAdaptor } from "./adaptors";
import sizeOf from "image-size";

export type ConfluenceImageStatus = "existing" | "uploaded";

export interface UploadedImageData {
	filename: string;
	id: string;
	collection: string;
	width: number;
	height: number;
	status: ConfluenceImageStatus;
}

export async function uploadBuffer(
	confluenceClient: CustomConfluenceClient,
	pageId: string,
	uploadFilename: string,
	fileBuffer: Buffer,
	currentAttachments: Record<
		string,
		{ filehash: string; attachmentId: string; collectionName: string }
	>
): Promise<UploadedImageData | null> {
	const spark = new SparkMD5.ArrayBuffer();
	const currentFileMd5 = spark.append(fileBuffer).end();
	const imageSize = await sizeOf(fileBuffer);

	if (
		!!currentAttachments[uploadFilename] &&
		currentAttachments[uploadFilename].filehash === currentFileMd5
	) {
		return {
			filename: uploadFilename,
			id: currentAttachments[uploadFilename].attachmentId,
			collection: currentAttachments[uploadFilename].collectionName,
			width: imageSize.width ?? 0,
			height: imageSize.height ?? 0,
			status: "existing",
		};
	}

	const attachmentDetails = {
		id: pageId,
		attachments: [
			{
				file: fileBuffer,
				filename: uploadFilename,
				minorEdit: false,
				comment: currentFileMd5,
				contentType: "image/png",
			},
		],
	};

	const attachmentResponse =
		await confluenceClient.contentAttachments.createOrUpdateAttachments(
			attachmentDetails
		);

	return {
		filename: uploadFilename,
		id: attachmentResponse.results[0].extensions.fileId,
		collection: `contentId-${attachmentResponse.results[0].container.id}`,
		width: imageSize.width ?? 0,
		height: imageSize.height ?? 0,
		status: "uploaded",
	};
}

export async function uploadFile(
	confluenceClient: CustomConfluenceClient,
	adaptor: LoaderAdaptor,
	pageId: string,
	pageFilePath: string,
	fileNameToUpload: string,
	currentAttachments: Record<
		string,
		{ filehash: string; attachmentId: string; collectionName: string }
	>
): Promise<UploadedImageData | null> {
	const testing = await adaptor.readBinary(fileNameToUpload, pageFilePath);
	if (testing) {
		const spark = new SparkMD5.ArrayBuffer();
		const currentFileMd5 = spark.append(testing.contents).end();
		const pathMd5 = SparkMD5.hash(testing.filePath);
		const uploadFilename = `${pathMd5}-${testing.filename}`;
		const imageBuffer = Buffer.from(testing.contents);
		const imageSize = await sizeOf(imageBuffer);

		if (
			!!currentAttachments[uploadFilename] &&
			currentAttachments[uploadFilename].filehash === currentFileMd5
		) {
			return {
				filename: fileNameToUpload,
				id: currentAttachments[uploadFilename].attachmentId,
				collection: currentAttachments[uploadFilename].collectionName,
				width: imageSize.width ?? 0,
				height: imageSize.height ?? 0,
				status: "existing",
			};
		}

		const attachmentDetails = {
			id: pageId,
			attachments: [
				{
					file: imageBuffer,
					filename: uploadFilename,
					minorEdit: false,
					comment: currentFileMd5,
				},
			],
		};

		const attachmentResponse =
			await confluenceClient.contentAttachments.createOrUpdateAttachments(
				attachmentDetails
			);

		return {
			filename: fileNameToUpload,
			id: attachmentResponse.results[0].extensions.fileId,
			collection: `contentId-${attachmentResponse.results[0].container.id}`,
			width: imageSize.width ?? 0,
			height: imageSize.height ?? 0,
			status: "uploaded",
		};
	}

	return null;
}
