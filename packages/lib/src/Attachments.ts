import { Effect } from "effect";
import SparkMD5 from "spark-md5";
import { runEffect } from "./effects";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { MarkdownWorkspace, MarkdownWorkspaceService } from "./MarkdownWorkspace";
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

function toArrayBuffer(contents: Uint8Array): ArrayBuffer {
	return Uint8Array.from(contents).buffer;
}

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
	return runEffect(
		uploadBufferEffect(
			confluenceClient,
			pageId,
			uploadFilename,
			fileBuffer,
			currentAttachments,
		),
	);
}

export function uploadBufferEffect(
	confluenceClient: RequiredConfluenceClient,
	pageId: string,
	uploadFilename: string,
	fileBuffer: Buffer,
	currentAttachments: Record<
		string,
		{ filehash: string; attachmentId: string; collectionName: string }
	>,
): Effect.Effect<UploadedImageData | null, unknown, never> {
	return Effect.gen(function* () {
		const spark = new SparkMD5.ArrayBuffer();
		const currentFileMd5 = spark.append(toArrayBuffer(fileBuffer)).end();
		const imageSize = yield* Effect.try({
			try: () => sizeOf(fileBuffer),
			catch: identity,
		});

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

		const attachmentResponse = yield* Effect.tryPromise({
			try: () =>
				confluenceClient.contentAttachments.createOrUpdateAttachments(attachmentDetails),
			catch: identity,
		});

		const attachmentUploadResponse = attachmentResponse.results[0];
		if (!attachmentUploadResponse) {
			return yield* Effect.fail(new Error("Issue uploading buffer"));
		}

		return {
			filename: uploadFilename,
			id: attachmentUploadResponse.extensions.fileId,
			collection: `contentId-${attachmentUploadResponse.container.id}`,
			width: imageSize.width ?? 0,
			height: imageSize.height ?? 0,
			status: "uploaded",
		};
	});
}

export async function uploadFile(
	confluenceClient: RequiredConfluenceClient,
	workspace: MarkdownWorkspace,
	pageId: string,
	pageFilePath: string,
	fileNameToUpload: string,
	currentAttachments: CurrentAttachments,
): Promise<UploadedImageData | null> {
	return runEffect(
		uploadFileEffect(
			confluenceClient,
			pageId,
			pageFilePath,
			fileNameToUpload,
			currentAttachments,
		).pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
	);
}

export function uploadFileEffect(
	confluenceClient: RequiredConfluenceClient,
	pageId: string,
	pageFilePath: string,
	fileNameToUpload: string,
	currentAttachments: CurrentAttachments,
): Effect.Effect<UploadedImageData | null, unknown, MarkdownWorkspaceService> {
	return Effect.gen(function* () {
		const workspace = yield* MarkdownWorkspaceService;
		let fileNameForUpload = fileNameToUpload;
		let testing = yield* workspace.readBinary(fileNameForUpload, pageFilePath);
		if (!testing) {
			fileNameForUpload = decodeURI(fileNameForUpload);
			testing = yield* workspace.readBinary(fileNameForUpload, pageFilePath);
		}
		if (testing) {
			const binaryContents =
				testing.contents instanceof ArrayBuffer
					? new Uint8Array(testing.contents)
					: testing.contents;
			const spark = new SparkMD5.ArrayBuffer();
			const currentFileMd5 = spark.append(toArrayBuffer(binaryContents)).end();
			const pathMd5 = SparkMD5.hash(testing.filePath);
			const uploadFilename = `${pathMd5}-${testing.filename}`;
			const imageBuffer = Buffer.from(binaryContents);
			const imageSize = yield* Effect.try({
				try: () => sizeOf(imageBuffer),
				catch: identity,
			});

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

			const attachmentResponse = yield* Effect.tryPromise({
				try: () =>
					confluenceClient.contentAttachments.createOrUpdateAttachments(
						attachmentDetails,
					),
				catch: identity,
			});

			const attachmentUploadResponse = attachmentResponse.results[0];
			if (!attachmentUploadResponse) {
				return yield* Effect.fail(new Error("Issue uploading image"));
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
	});
}

function identity(error: unknown): unknown {
	return error;
}
