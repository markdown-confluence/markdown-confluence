import SparkMD5 from "spark-md5";
import { CustomConfluenceClient, LoaderAdaptor } from "./adaptors/types";

export interface UploadedImageData {
	filename: string;
	id: string;
	collection: string;
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

	if (
		!!currentAttachments[uploadFilename] &&
		currentAttachments[uploadFilename].filehash === currentFileMd5
	) {
		return {
			filename: uploadFilename,
			id: currentAttachments[uploadFilename].attachmentId,
			collection: currentAttachments[uploadFilename].collectionName,
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

		if (
			!!currentAttachments[uploadFilename] &&
			currentAttachments[uploadFilename].filehash === currentFileMd5
		) {
			return {
				filename: fileNameToUpload,
				id: currentAttachments[uploadFilename].attachmentId,
				collection: currentAttachments[uploadFilename].collectionName,
			};
		}

		const attachmentDetails = {
			id: pageId,
			attachments: [
				{
					file: Buffer.from(testing.contents),
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
		};
	}

	return null;
}
