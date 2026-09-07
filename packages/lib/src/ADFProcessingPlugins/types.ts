import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { filter } from "@atlaskit/adf-utils/traverse";
import { readMathExpression } from "./MathRendererPlugin";
import { Effect } from "effect";
import {
	CurrentAttachments,
	UploadedImageData,
	uploadBuffer,
	uploadBufferEffect,
	uploadFile,
	uploadFileEffect,
} from "../Attachments";
import { RequiredConfluenceClient } from "../ConfluenceClient";
import { MarkdownConfluencePlatform, runEffect } from "../effects";
import { MarkdownWorkspace, MarkdownWorkspaceService } from "../MarkdownWorkspace";

export interface PublisherFunctions {
	uploadBuffer(
		uploadFilename: string,
		fileBuffer: Buffer,
		contentType?: string,
	): Promise<UploadedImageData | null>;
	uploadBufferEffect(
		uploadFilename: string,
		fileBuffer: Buffer,
		contentType?: string,
	): Effect.Effect<UploadedImageData | null, unknown, MarkdownConfluencePlatform>;
	uploadFile(fileNameToUpload: string): Promise<UploadedImageData | null>;
	uploadFileEffect(
		fileNameToUpload: string,
	): Effect.Effect<UploadedImageData | null, unknown, MarkdownConfluencePlatform>;
}

export interface ADFProcessingPlugin<E, T> {
	extract(adf: JSONDocNode, supportFunctions: PublisherFunctions): E;
	transform(items: E, supportFunctions: PublisherFunctions): Promise<T>;
	transformEffect?(
		items: E,
		supportFunctions: PublisherFunctions,
	): Effect.Effect<T, unknown, MarkdownConfluencePlatform>;
	load(adf: JSONDocNode, transformedItems: T, supportFunctions: PublisherFunctions): JSONDocNode;
}

export interface ADFPreprocessorContext {
	workspace: MarkdownWorkspace;
	pageFilePath: string;
}

// Runs before the main ADF processing pipeline. Use this for transforms that
// need async I/O (e.g. reading referenced files) before extraction starts —
// the ADFProcessingPlugin contract has a sync extract() that can't do I/O.
export interface ADFPreprocessor {
	preprocess(
		adf: JSONDocNode,
		ctx: ADFPreprocessorContext,
	): Effect.Effect<JSONDocNode, unknown, MarkdownConfluencePlatform>;
}

export function executeADFPreprocessorsEffect(
	preprocessors: ADFPreprocessor[],
	adf: JSONDocNode,
	ctx: ADFPreprocessorContext,
): Effect.Effect<JSONDocNode, unknown, MarkdownConfluencePlatform> {
	return Effect.gen(function* () {
		let current = adf;
		for (const preprocessor of preprocessors) {
			current = yield* preprocessor.preprocess(current, ctx);
		}
		return current;
	});
}

export function createPublisherFunctions(
	confluenceClient: RequiredConfluenceClient,
	workspace: MarkdownWorkspace,
	pageId: string,
	pageFilePath: string,
	currentAttachments: CurrentAttachments,
): PublisherFunctions {
	return {
		uploadFileEffect: (fileNameToUpload: string) =>
			uploadFileEffect(
				confluenceClient,
				pageId,
				pageFilePath,
				fileNameToUpload,
				currentAttachments,
			).pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),

		uploadFile: async function (fileNameToUpload: string): Promise<UploadedImageData | null> {
			const uploadedContent = await uploadFile(
				confluenceClient,
				workspace,
				pageId,
				pageFilePath,
				fileNameToUpload,
				currentAttachments,
			);
			return uploadedContent;
		},

		uploadBufferEffect: (uploadFilename: string, fileBuffer: Buffer, contentType?: string) =>
			uploadBufferEffect(
				confluenceClient,
				pageId,
				uploadFilename,
				fileBuffer,
				currentAttachments,
				contentType,
			),

		uploadBuffer: async function (
			uploadFilename: string,
			fileBuffer: Buffer,
			contentType?: string,
		): Promise<UploadedImageData | null> {
			const uploadedContent = await uploadBuffer(
				confluenceClient,
				pageId,
				uploadFilename,
				fileBuffer,
				currentAttachments,
				contentType,
			);

			return uploadedContent;
		},
	};
}

export async function executeADFProcessingPipeline(
	plugins: ADFProcessingPlugin<unknown, unknown>[],
	adf: JSONDocNode,
	supportFunctions: PublisherFunctions,
): Promise<JSONDocNode> {
	return runEffect(executeADFProcessingPipelineEffect(plugins, adf, supportFunctions));
}

export function executeADFProcessingPipelineEffect(
	plugins: ADFProcessingPlugin<unknown, unknown>[],
	adf: JSONDocNode,
	supportFunctions: PublisherFunctions,
): Effect.Effect<JSONDocNode, unknown, MarkdownConfluencePlatform> {
	return Effect.gen(function* () {
		// Extract data in parallel
		const extractedData = plugins.map((plugin) => plugin.extract(adf, supportFunctions));

		// Transform data in parallel
		const transformedData = yield* Effect.all(
			plugins.map((plugin, index) =>
				plugin.transformEffect
					? plugin.transformEffect(extractedData[index], supportFunctions)
					: Effect.tryPromise({
							try: () => plugin.transform(extractedData[index], supportFunctions),
							catch: identity,
						}),
			),
			{ concurrency: "unbounded" },
		);

		// Load transformed data synchronously using reduce
		const finalADF = plugins.reduce((accADF, plugin, index) => {
			return plugin.load(accADF, transformedData[index], supportFunctions);
		}, adf);
		if (filter(finalADF, (node) => !!readMathExpression(node)).length) {
			return yield* Effect.fail(
				new Error("LaTeX equations require MathRendererPlugin with a math renderer"),
			);
		}

		return finalADF;
	});
}

function identity(error: unknown): unknown {
	return error;
}
