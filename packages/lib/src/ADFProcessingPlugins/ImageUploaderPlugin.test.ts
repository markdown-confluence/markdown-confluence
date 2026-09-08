import { expect, test, vi } from "@effect/vitest";
import { Effect } from "effect";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { UploadedImageData } from "../Attachments";
import { ImageUploaderPlugin } from "./ImageUploaderPlugin";
import { convertADFToMarkdown } from "../AdfConversion";
import { parseMarkdownToADF } from "../MdToADF";
import { executeADFProcessingPipeline, type PublisherFunctions } from "./types";

test("keeps requested media width after uploading an image", () => {
	const adf = docWithMedia({
		type: "file",
		url: "file://img/chewbacca.png",
		width: "111",
		height: null,
	});

	const result = ImageUploaderPlugin.load(adf, {
		"file://img/chewbacca.png": uploadedImage,
	});

	const mediaAttrs = getFirstMediaAttrs(result);
	expect(mediaAttrs).toMatchObject({
		collection: "contentId-page-id",
		id: "attachment-id",
		type: "file",
		width: 111,
	});
	expect(mediaAttrs?.["height"]).toBe(480);
	expect(mediaAttrs?.["url"]).toBeUndefined();
});

test("uses uploaded media dimensions when markdown did not request a size", () => {
	const adf = docWithMedia({
		type: "file",
		url: "file://img/chewbacca.png",
	});

	const result = ImageUploaderPlugin.load(adf, {
		"file://img/chewbacca.png": uploadedImage,
	});

	expect(getFirstMediaAttrs(result)).toMatchObject({
		collection: "contentId-page-id",
		height: 480,
		id: "attachment-id",
		type: "file",
		width: 640,
	});
});

const uploadedImage: UploadedImageData = {
	collection: "contentId-page-id",
	filename: "chewbacca.png",
	height: 480,
	id: "attachment-id",
	status: "uploaded",
	width: 640,
};

function docWithMedia(mediaAttrs: Record<string, unknown>): JSONDocNode {
	return {
		version: 1,
		type: "doc",
		content: [
			{
				type: "mediaSingle",
				attrs: {
					layout: "center",
				},
				content: [
					{
						type: "media",
						attrs: {
							collection: "",
							id: "",
							...mediaAttrs,
						},
					},
				],
			},
		],
	} as JSONDocNode;
}

function getFirstMediaAttrs(adf: JSONDocNode): Record<string, unknown> | undefined {
	const mediaSingle = adf.content?.[0];
	const media = mediaSingle?.content?.[0];
	return media?.attrs as Record<string, unknown> | undefined;
}

test("non-image attachments use Confluence media groups without image dimensions", () => {
	const result = ImageUploaderPlugin.load(
		docWithMedia({ type: "file", url: "file://sample.txt" }),
		{
			"file://sample.txt": { ...uploadedImage, filename: "sample.txt", width: 0, height: 0 },
		},
	);
	expect(result.content[0]?.type).toBe("mediaGroup");
	expect(getFirstMediaAttrs(result)).toEqual({
		type: "file",
		id: "attachment-id",
		collection: "contentId-page-id",
	});
});

test("MP4 embeds remain attachment media groups even with image-style size hints", () => {
	const result = ImageUploaderPlugin.load(
		docWithMedia({ type: "file", url: "file://clip.mp4", width: "320", height: "180" }),
		{
			"file://clip.mp4": { ...uploadedImage, filename: "clip.mp4", width: 0, height: 0 },
		},
	);
	expect(result.content[0]?.type).toBe("mediaGroup");
	expect(getFirstMediaAttrs(result)).toEqual({
		type: "file",
		id: "attachment-id",
		collection: "contentId-page-id",
	});
});

test.each([
	{ type: "file", id: "remote-id", collection: "remote-collection" },
	{ type: "file", id: "remote-id", collection: "remote-collection", url: "file://old.png" },
	{ type: "external", url: "https://example.com/image.png" },
	{ type: "file", url: null },
	{ type: "file", url: 123 },
])("ignores resolved or non-local media %j", (attrs) => {
	const adf = docWithMedia(attrs);
	expect(ImageUploaderPlugin.extract(adf)).toEqual([]);
	expect(ImageUploaderPlugin.load(structuredClone(adf), {})).toEqual(adf);
});

test("republishes exported remote media and uploads only unresolved local attachments", async () => {
	const remote = docWithMedia({
		type: "file",
		id: "remote-id",
		collection: "remote-collection",
		width: 320,
		height: 200,
	});
	const markdown = convertADFToMarkdown(remote);
	const restored = parseMarkdownToADF(markdown, "https://example.atlassian.net");
	expect(restored).toEqual(remote);
	const uploadFileEffect = vi.fn(() => Effect.succeed(uploadedImage));
	const support: PublisherFunctions = {
		uploadFileEffect,
		uploadBufferEffect: () => Effect.fail(new Error("Unexpected buffer upload")),
		uploadFile: async () => {
			throw new Error("Unexpected promise upload");
		},
		uploadBuffer: async () => {
			throw new Error("Unexpected buffer upload");
		},
	};
	expect(await executeADFProcessingPipeline([ImageUploaderPlugin], restored, support)).toEqual(
		remote,
	);
	expect(uploadFileEffect).not.toHaveBeenCalled();
	const mixed = {
		...remote,
		content: [
			...remote.content,
			...docWithMedia({ type: "file", url: "file://img/chewbacca.png" }).content,
			...docWithMedia({ type: "external", url: "https://example.com/external.png" }).content,
		],
	};
	const published = await executeADFProcessingPipeline([ImageUploaderPlugin], mixed, support);
	expect(uploadFileEffect).toHaveBeenCalledExactlyOnceWith("img/chewbacca.png");
	expect(published.content[0]).toEqual(remote.content[0]);
	expect(published.content[1]?.content?.[0]?.attrs).toMatchObject({
		id: "attachment-id",
		collection: "contentId-page-id",
	});
	expect(published.content[2]).toEqual(mixed.content[2]);
	const again = await executeADFProcessingPipeline(
		[ImageUploaderPlugin],
		structuredClone(published),
		support,
	);
	expect(again).toEqual(published);
	expect(uploadFileEffect).toHaveBeenCalledTimes(1);
});
