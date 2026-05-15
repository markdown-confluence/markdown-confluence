import { expect, jest, test } from "@jest/globals";
import { uploadFile } from "./Attachments";
import {
	BinaryFile,
	LoaderAdaptor,
	RequiredConfluenceClient,
} from "./adaptors";

test("uploads non-image attachments without requiring image dimensions", async () => {
	const createOrUpdateAttachments = jest.fn(async () => ({
		results: [
			{
				extensions: { fileId: "attachment-1" },
				container: { id: "page-1" },
			},
		],
	}));
	const confluenceClient = {
		contentAttachments: {
			createOrUpdateAttachments,
		},
	} as unknown as RequiredConfluenceClient;
	const adaptor = {
		async readBinary(): Promise<BinaryFile> {
			return {
				contents: Buffer.from("not an image"),
				filePath: "docs/movie.mp4",
				filename: "movie.mp4",
				mimeType: "video/mp4",
			};
		},
	} as unknown as LoaderAdaptor;

	const result = await uploadFile(
		confluenceClient,
		adaptor,
		"page-1",
		"docs/page.md",
		"movie.mp4",
		{},
	);

	expect(createOrUpdateAttachments).toHaveBeenCalledTimes(1);
	expect(result).toMatchObject({
		filename: "movie.mp4",
		id: "attachment-1",
		collection: "contentId-page-1",
		width: 0,
		height: 0,
		status: "uploaded",
	});
});
