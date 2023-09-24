import SparkMD5 from "spark-md5";
import { RequiredConfluenceClient, LoaderAdaptor } from "./adaptors";
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

export type CurrentAttachments = Record<
	string,
	{
		filehash: string;
		attachmentId: string;
		collectionName: string;
	}
>;

export async function uploadBuffer(
	confluenceClient: RequiredConfluenceClient,
	pageId: string,
	uploadFilename: string,
	fileBuffer: Buffer,
	currentAttachments: Record<
		string,
		{ filehash: string; attachmentId: string; collectionName: string }
	>,
): Promise<UploadedImageData | null> {
	const spark = new SparkMD5.ArrayBuffer();
	const currentFileMd5 = spark.append(fileBuffer).end();
	const imageSize = await sizeOf(fileBuffer);

	const fileInCurrentAttachments = currentAttachments[uploadFilename];
	if (fileInCurrentAttachments?.filehash === currentFileMd5) {
		return {
			filename: uploadFilename,
			id: fileInCurrentAttachments.attachmentId,
			collection: fileInCurrentAttachments.collectionName,
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
			attachmentDetails,
		);

	const attachmentUploadResponse = attachmentResponse.results[0];
	if (!attachmentUploadResponse) {
		throw new Error("Issue uploading buffer");
	}

	return {
		filename: uploadFilename,
		id: attachmentUploadResponse.extensions.fileId,
		collection: `contentId-${attachmentUploadResponse.container.id}`,
		width: imageSize.width ?? 0,
		height: imageSize.height ?? 0,
		status: "uploaded",
	};
}

export async function uploadFile(
	confluenceClient: RequiredConfluenceClient,
	adaptor: LoaderAdaptor,
	pageId: string,
	pageFilePath: string,
	fileNameToUpload: string,
	currentAttachments: CurrentAttachments,
): Promise<UploadedImageData | null> {
	let fileNameForUpload = fileNameToUpload;
	let testing = await adaptor.readBinary(fileNameForUpload, pageFilePath);
	if (!testing) {
		fileNameForUpload = decodeURI(fileNameForUpload);
		testing = await adaptor.readBinary(fileNameForUpload, pageFilePath);
	}
	if (testing) {
		const spark = new SparkMD5.ArrayBuffer();
		const currentFileMd5 = spark.append(testing.contents).end();
		const pathMd5 = SparkMD5.hash(testing.filePath);
		const uploadFilename = `${pathMd5}-${testing.filename}`;
		const imageBuffer = Buffer.from(testing.contents);
		const imageSize = await sizeOf(imageBuffer);

		const fileInCurrentAttachments = currentAttachments[uploadFilename];
		if (fileInCurrentAttachments?.filehash === currentFileMd5) {
			return {
				filename: fileNameForUpload,
				id: fileInCurrentAttachments.attachmentId,
				collection: fileInCurrentAttachments.collectionName,
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
				attachmentDetails,
			);

		const attachmentUploadResponse = attachmentResponse.results[0];
		if (!attachmentUploadResponse) {
			throw new Error("Issue uploading image");
		}

		return {
			filename: fileNameForUpload,
			id: attachmentUploadResponse.extensions.fileId,
			collection: `contentId-${attachmentUploadResponse.container.id}`,
			width: imageSize.width ?? 0,
			height: imageSize.height ?? 0,
			status: "uploaded",
		};
	}

	return null;
}
