import { Effect } from "effect";
import SparkMD5 from "spark-md5";
import { lookup } from "mime-types";
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

type AttachmentUploadResponse = {
	results: { extensions: { fileId: string }; container: { id: string } }[];
};

// confluence.js's Api.ContentAttachments has a private `client` with a
// sendRequest method. We reach in structurally rather than importing internals.
type InternalSendRequest = (config: {
	url: string;
	method: string;
	headers?: Record<string, string>;
	params?: Record<string, unknown>;
	data?: unknown;
}) => Promise<unknown>;

// We sidestep confluence.js's createOrUpdateAttachments. Its multipart
// serialization appends non-file fields (minorEdit) with a filename argument,
// which makes Confluence Cloud's stricter validation count them as extra file
// parts and reject the upload ("Must have the same number of attachment files
// and minorEdits flags…"). This shows up through the Obsidian requestUrl
// transport in particular. We build a single `file`-part multipart body
// ourselves and dispatch through the same client transport, which works in
// both Node (CLI) and Electron (Obsidian).
//
// Tradeoff: we send only the file part, no `comment`. The previous code stored
// the content MD5 in the comment for cross-publish dedup; including any extra
// part re-triggers the rejection. So unchanged attachments are re-uploaded on
// each publish (wasteful but correct); same-publish dedup by filename still
// applies.
function buildAttachmentMultipart(
	fileBuffer: Buffer,
	filename: string,
	contentType: string,
): { body: Buffer; contentType: string } {
	const boundary = `----confluence-attachment-${SparkMD5.hash(`${filename}-${fileBuffer.length}`).slice(0, 16)}`;
	const dash = `--${boundary}`;
	const header = Buffer.from(
		`${dash}\r\n` +
			`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
			`Content-Type: ${contentType}\r\n\r\n`,
	);
	const trailer = Buffer.from(`\r\n${dash}--\r\n`);
	return {
		body: Buffer.concat([header, fileBuffer, trailer]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

function uploadAttachmentEffect(
	confluenceClient: RequiredConfluenceClient,
	pageId: string,
	fileBuffer: Buffer,
	filename: string,
	contentType: string,
): Effect.Effect<AttachmentUploadResponse, unknown, never> {
	return Effect.gen(function* () {
		const internalClient = (
			confluenceClient.contentAttachments as unknown as {
				client?: { sendRequest: InternalSendRequest };
			}
		).client;
		if (!internalClient) {
			return yield* Effect.fail(
				new Error(
					"ConfluenceClient.contentAttachments has no underlying transport — incompatible client",
				),
			);
		}
		const { body, contentType: multipartContentType } = buildAttachmentMultipart(
			fileBuffer,
			filename,
			contentType,
		);
		const result = yield* Effect.tryPromise({
			try: () =>
				internalClient.sendRequest({
					url: `/api/content/${pageId}/child/attachment`,
					method: "PUT",
					headers: {
						// eslint-disable-next-line @typescript-eslint/naming-convention
						"X-Atlassian-Token": "no-check",
						// eslint-disable-next-line @typescript-eslint/naming-convention
						"Content-Type": multipartContentType,
					},
					data: body,
				}),
			catch: identity,
		});
		return result as AttachmentUploadResponse;
	});
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
	contentType?: string,
): Promise<UploadedImageData | null> {
	return runEffect(
		uploadBufferEffect(
			confluenceClient,
			pageId,
			uploadFilename,
			fileBuffer,
			currentAttachments,
			contentType,
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
	contentType?: string,
): Effect.Effect<UploadedImageData | null, unknown, never> {
	return Effect.gen(function* () {
		const spark = new SparkMD5.ArrayBuffer();
		const currentFileMd5 = spark.append(toArrayBuffer(fileBuffer)).end();
		const imageSize = getImageSize(fileBuffer);

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

		const attachmentResponse = yield* uploadAttachmentEffect(
			confluenceClient,
			pageId,
			fileBuffer,
			uploadFilename,
			resolveContentType(uploadFilename, contentType),
		);

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
			fileNameForUpload = decodeFileNameComponent(fileNameForUpload);
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
			const imageSize = getImageSize(imageBuffer);

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

			const attachmentResponse = yield* uploadAttachmentEffect(
				confluenceClient,
				pageId,
				imageBuffer,
				uploadFilename,
				testing.mimeType,
			);

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

function decodeFileNameComponent(fileName: string): string {
	try {
		return decodeURIComponent(fileName);
	} catch {
		return fileName;
	}
}

function getImageSize(buffer: Buffer): { width?: number; height?: number } {
	try {
		return sizeOf(buffer);
	} catch {
		return {};
	}
}

function resolveContentType(uploadFilename: string, contentType: string | undefined): string {
	return contentType ?? (lookup(uploadFilename) || "application/octet-stream");
}

function identity(error: unknown): unknown {
	return error;
}
