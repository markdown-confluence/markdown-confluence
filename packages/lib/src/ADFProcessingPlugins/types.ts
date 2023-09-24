import {
	CurrentAttachments,
	UploadedImageData,
	uploadBuffer,
	uploadFile,
} from "../Attachments";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LoaderAdaptor, RequiredConfluenceClient } from "../adaptors";

export interface PublisherFunctions {
	uploadBuffer(
		uploadFilename: string,
		fileBuffer: Buffer,
	): Promise<UploadedImageData | null>;
	uploadFile(fileNameToUpload: string): Promise<UploadedImageData | null>;
}

export interface ADFProcessingPlugin<E, T> {
	extract(adf: JSONDocNode, supportFunctions: PublisherFunctions): E;
	transform(items: E, supportFunctions: PublisherFunctions): Promise<T>;
	load(
		adf: JSONDocNode,
		transformedItems: T,
		supportFunctions: PublisherFunctions,
	): JSONDocNode;
}

export function createPublisherFunctions(
	confluenceClient: RequiredConfluenceClient,
	adaptor: LoaderAdaptor,
	pageId: string,
	pageFilePath: string,
	currentAttachments: CurrentAttachments,
): PublisherFunctions {
	return {
		uploadFile: async function (
			fileNameToUpload: string,
		): Promise<UploadedImageData | null> {
			const uploadedContent = await uploadFile(
				confluenceClient,
				adaptor,
				pageId,
				pageFilePath,
				fileNameToUpload,
				currentAttachments,
			);
			return uploadedContent;
		},

		uploadBuffer: async function (
			uploadFilename: string,
			fileBuffer: Buffer,
		): Promise<UploadedImageData | null> {
			const uploadedContent = await uploadBuffer(
				confluenceClient,
				pageId,
				uploadFilename,
				fileBuffer,
				currentAttachments,
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
	// Extract data in parallel
	const extractedData = plugins.map((plugin) =>
		plugin.extract(adf, supportFunctions),
	);

	// Transform data in parallel
	const transformedData = await Promise.all(
		plugins.map((plugin, index) =>
			plugin.transform(extractedData[index], supportFunctions),
		),
	);

	// Load transformed data synchronously using reduce
	const finalADF = plugins.reduce((accADF, plugin, index) => {
		return plugin.load(accADF, transformedData[index], supportFunctions);
	}, adf);

	return finalADF;
}
