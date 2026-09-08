import { filter, traverse } from "@atlaskit/adf-utils/traverse";
import { UploadedImageData } from "../Attachments";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ADFEntity } from "@atlaskit/adf-utils/dist/types/types";
import { p } from "@atlaskit/adf-utils/builders";
import { ADFProcessingPlugin, PublisherFunctions } from "./types";
import { Effect } from "effect";
import { MarkdownConfluencePlatform, runEffect } from "../effects";

export const ImageUploaderPlugin: ADFProcessingPlugin<
	string[],
	Record<string, UploadedImageData | null>
> = {
	extract(adf: JSONDocNode): string[] {
		const mediaNodes = filter(
			adf,
			(node) => node.type === "media" && (node.attrs || {})?.["type"] === "file",
		);

		const imagesToUpload = new Set(mediaNodes.map((node) => node?.attrs?.["url"]));

		return Array.from(imagesToUpload);
	},

	async transform(
		imagesToUpload: string[],
		supportFunctions: PublisherFunctions,
	): Promise<Record<string, UploadedImageData | null>> {
		return runEffect(ImageUploaderPlugin.transformEffect!(imagesToUpload, supportFunctions));
	},

	transformEffect(
		imagesToUpload: string[],
		supportFunctions: PublisherFunctions,
	): Effect.Effect<
		Record<string, UploadedImageData | null>,
		unknown,
		MarkdownConfluencePlatform
	> {
		return Effect.gen(function* () {
			let imageMap: Record<string, UploadedImageData | null> = {};

			for (const imageUrl of imagesToUpload.values()) {
				const filename = imageUrl.split("://")[1];
				if (!filename) {
					continue;
				}
				const uploadedContent = yield* supportFunctions.uploadFileEffect(filename);

				imageMap = {
					...imageMap,
					[imageUrl]: uploadedContent,
				};
			}

			return imageMap;
		});
	},

	load(adf: JSONDocNode, imageMap: Record<string, UploadedImageData | null>): JSONDocNode {
		let afterAdf = adf as ADFEntity;

		afterAdf =
			traverse(afterAdf, {
				media: (node, _parent) => {
					if (node?.attrs?.["type"] === "file") {
						if (!imageMap[node?.attrs?.["url"]]) {
							return;
						}
						const mappedImage = imageMap[node.attrs["url"]];
						if (mappedImage) {
							// Size hints cannot turn a non-image attachment into an image.
							const isImage = mappedImage.width > 0 || mappedImage.height > 0;
							node.attrs["width"] = isImage
								? (mediaDimension(node.attrs["width"]) ?? mappedImage.width)
								: 0;
							node.attrs["height"] = isImage
								? (mediaDimension(node.attrs["height"]) ?? mappedImage.height)
								: 0;
							node.attrs["collection"] = mappedImage.collection;
							node.attrs["id"] = mappedImage.id;
							delete node.attrs["url"];
							return node;
						}
					}
					return;
				},
			}) || afterAdf;

		afterAdf =
			traverse(afterAdf, {
				mediaSingle: (node, _parent) => {
					if (!node || !node.content) {
						return;
					}
					const media = node.content.at(0);
					if (media?.attrs?.["width"] === 0 && media.attrs["height"] === 0) {
						delete media.attrs["width"];
						delete media.attrs["height"];
						return { type: "mediaGroup", content: [media] };
					}
					const url = node.content.at(0)?.attrs?.["url"];
					if (typeof url === "string" && url.startsWith("file://")) {
						return p("Invalid Image Path");
					}
					return;
				},
			}) || afterAdf;

		return afterAdf as JSONDocNode;
	},
};

function mediaDimension(value: unknown): number | undefined {
	if (typeof value !== "number" && typeof value !== "string") return undefined;
	const dimension = Number(value);
	return Number.isFinite(dimension) && dimension > 0 ? dimension : undefined;
}
