import { expect, test } from "@effect/vitest";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { UploadedImageData } from "../Attachments";
import { ImageUploaderPlugin } from "./ImageUploaderPlugin";

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
		width: "111",
	});
	expect(mediaAttrs?.["height"]).toBeUndefined();
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
