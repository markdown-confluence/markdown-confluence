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

interface AttachmentUploadResponse {
	results: {
		extensions: {
			fileId: string;
		};
		container: {
			id: string;
		};
	}[];
}

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

		const attachmentResponse = yield* Effect.tryPromise({
			try: () =>
				uploadAttachment(confluenceClient, {
					pageId,
					fileBuffer,
					uploadFilename,
					contentType: resolveContentType(uploadFilename, contentType),
					comment: currentFileMd5,
				}),
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

			const attachmentResponse = yield* Effect.tryPromise({
				try: () =>
					uploadAttachment(confluenceClient, {
						pageId,
						fileBuffer: imageBuffer,
						uploadFilename,
						contentType: testing.mimeType,
						comment: currentFileMd5,
					}),
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
		return getSvgImageSize(buffer) ?? {};
	}
}

function getSvgImageSize(buffer: Buffer): { width?: number; height?: number } | undefined {
	const svg = buffer.toString("utf-8", 0, Math.min(buffer.length, 4096));
	const svgTagStart = svg.indexOf("<svg");
	if (svgTagStart === -1) {
		return undefined;
	}
	const svgTag = svg.slice(svgTagStart);

	const width = parseSvgLength(svgTag.match(/\swidth="([^"]+)"/)?.[1]);
	const height = parseSvgLength(svgTag.match(/\sheight="([^"]+)"/)?.[1]);
	if (width && height) {
		return { width, height };
	}

	const viewBox = svgTag.match(/\sviewBox="([^"]+)"/)?.[1];
	if (viewBox) {
		const [, , viewBoxWidth, viewBoxHeight] = viewBox
			.trim()
			.split(/[\s,]+/)
			.map((value) => Number(value));
		if (viewBoxWidth && viewBoxHeight) {
			return { width: viewBoxWidth, height: viewBoxHeight };
		}
	}

	return undefined;
}

function parseSvgLength(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveContentType(uploadFilename: string, contentType: string | undefined): string {
	return contentType ?? (lookup(uploadFilename) || "application/octet-stream");
}

function uploadAttachment(
	confluenceClient: RequiredConfluenceClient,
	attachment: {
		pageId: string;
		fileBuffer: Buffer;
		uploadFilename: string;
		contentType: string;
		comment: string;
	},
): Promise<AttachmentUploadResponse> {
	const formData = new FormData();
	formData.append(
		"file",
		new Blob([Uint8Array.from(attachment.fileBuffer)], { type: attachment.contentType }),
		attachment.uploadFilename,
	);
	formData.append("minorEdit", "false");
	formData.append("comment", attachment.comment);

	return confluenceClient.sendRequest<AttachmentUploadResponse>({
		url: `/wiki/rest/api/content/${attachment.pageId}/child/attachment`,
		method: "PUT",
		headers: {
			"X-Atlassian-Token": "no-check",
		},
		body: formData,
	});
}

function identity(error: unknown): unknown {
	return error;
}
