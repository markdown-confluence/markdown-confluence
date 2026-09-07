import { filter } from "@atlaskit/adf-utils/traverse";
import { UploadedImageData } from "../Attachments";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { ADFProcessingPlugin, PublisherFunctions } from "./types";
import { ChartData } from "./MermaidRendererPlugin";
import { ADFEntity } from "@atlaskit/adf-utils/types";
import SparkMD5 from "spark-md5";
import { Effect } from "effect";
import { MarkdownConfluencePlatform, runEffect } from "../effects";

const PLANTUML_LANGUAGE_TAGS = new Set(["plantuml", "puml", "uml"]);
const PLANTUML_FALLBACK = "@startuml\nAlice -> Bob\n@enduml";

function isPlantumlLanguage(language: unknown): boolean {
	if (typeof language !== "string") {
		return false;
	}
	return PLANTUML_LANGUAGE_TAGS.has(language.trim().toLowerCase());
}

// Wrap snippets missing the @startuml/@enduml envelope (e.g. .iuml include
// files) so the same dedup hash works regardless of include style.
function normalizePlantumlSource(source: string): string {
	const trimmed = source.trim();
	if (trimmed.length === 0) {
		return PLANTUML_FALLBACK;
	}
	if (/^@start[a-z]+/i.test(trimmed)) {
		return source;
	}
	return `@startuml\n${source}\n@enduml`;
}

export function getPlantumlFileName(
	plantumlContent: string | undefined,
	format: "png" | "svg" = "png",
) {
	const plantumlText = normalizePlantumlSource(plantumlContent ?? "");
	const pathMd5 = SparkMD5.hash(plantumlText);
	const uploadFilename = `RenderedPlantumlChart-${pathMd5}.${format}`;
	return { uploadFilename, plantumlText };
}

export interface PlantumlRenderer {
	readonly format?: "png" | "svg";
	capturePlantumlCharts(charts: ChartData[]): Promise<Map<string, Buffer>>;
}

export class PlantumlRendererPlugin implements ADFProcessingPlugin<
	ChartData[],
	Record<string, UploadedImageData | null>
> {
	constructor(private plantumlRenderer: PlantumlRenderer) {}

	extract(adf: JSONDocNode): ChartData[] {
		const plantumlNodes = filter(
			adf,
			(node) =>
				node.type == "codeBlock" && isPlantumlLanguage((node.attrs || {})?.["language"]),
		);

		// Dedup by filename (a hash of the normalized source) so we don't hit
		// the PlantUML server twice for the same diagram in a single page.
		const plantumlNodesToUpload = new Map<string, ChartData>();
		for (const node of plantumlNodes) {
			const source = node?.content?.at(0)?.text;
			// Skip empty/whitespace blocks so we don't render the fallback
			// diagram for content the user never authored.
			if (typeof source !== "string" || source.trim().length === 0) {
				continue;
			}
			const plantumlDetails = getPlantumlFileName(source, this.plantumlRenderer.format);
			plantumlNodesToUpload.set(plantumlDetails.uploadFilename, {
				name: plantumlDetails.uploadFilename,
				data: plantumlDetails.plantumlText,
			});
		}

		return Array.from(plantumlNodesToUpload.values());
	}

	async transform(
		plantumlNodesToUpload: ChartData[],
		supportFunctions: PublisherFunctions,
	): Promise<Record<string, UploadedImageData | null>> {
		return runEffect(this.transformEffect(plantumlNodesToUpload, supportFunctions));
	}

	transformEffect(
		plantumlNodesToUpload: ChartData[],
		supportFunctions: PublisherFunctions,
	): Effect.Effect<
		Record<string, UploadedImageData | null>,
		unknown,
		MarkdownConfluencePlatform
	> {
		const plantumlRenderer = this.plantumlRenderer;

		return Effect.gen(function* () {
			let imageMap: Record<string, UploadedImageData | null> = {};
			if (plantumlNodesToUpload.length === 0) {
				return imageMap;
			}

			const plantumlChartsAsImages = yield* Effect.tryPromise({
				try: () => plantumlRenderer.capturePlantumlCharts([...plantumlNodesToUpload]),
				catch: identity,
			});

			for (const plantumlImage of plantumlChartsAsImages) {
				const uploadedContent = yield* supportFunctions.uploadBufferEffect(
					plantumlImage[0],
					plantumlImage[1],
					plantumlRenderer.format === "svg" ? "image/svg+xml" : "image/png",
				);

				imageMap = {
					...imageMap,
					[plantumlImage[0]]: uploadedContent,
				};
			}

			return imageMap;
		});
	}

	load(adf: JSONDocNode, imageMap: Record<string, UploadedImageData | null>): JSONDocNode {
		return walkContent(
			adf as ADFEntity,
			imageMap,
			this.plantumlRenderer.format ?? "png",
		) as JSONDocNode;
	}
}

function makeMediaSingle(mappedImage: UploadedImageData): ADFEntity {
	return {
		type: "mediaSingle",
		attrs: { layout: "center" },
		content: [
			{
				type: "media",
				attrs: {
					type: "file",
					collection: mappedImage.collection,
					id: mappedImage.id,
					width: mappedImage.width,
					height: mappedImage.height,
				},
			},
		],
	};
}

// "plaintext" (not "plantuml") matches the Confluence reference page and
// avoids the editor trying to syntax-highlight the source as plantuml.
function makeSourceExpand(plantumlText: string): ADFEntity {
	return {
		type: "expand",
		attrs: { title: "source" },
		content: [
			{
				type: "codeBlock",
				attrs: { language: "plaintext" },
				content: [{ type: "text", text: plantumlText }],
			},
		],
	};
}

function tryRewritePlantumlCodeBlock(
	node: ADFEntity,
	imageMap: Record<string, UploadedImageData | null>,
	format: "png" | "svg",
): [ADFEntity, ADFEntity] | null {
	if (node.type !== "codeBlock") {
		return null;
	}
	if (!isPlantumlLanguage(node.attrs?.["language"])) {
		return null;
	}
	const plantumlContent = node.content?.at(0)?.text;
	if (typeof plantumlContent !== "string" || plantumlContent.trim().length === 0) {
		return null;
	}
	const { uploadFilename, plantumlText } = getPlantumlFileName(plantumlContent, format);
	const mappedImage = imageMap[uploadFilename];
	if (!mappedImage) {
		return null;
	}
	return [makeMediaSingle(mappedImage), makeSourceExpand(plantumlText)];
}

// Synchronous, immutable walk: any subtree with a change is shallow-cloned;
// untouched subtrees are returned by reference. traverse() can only return one
// node per visit, so we walk content arrays directly to splice in the
// [mediaSingle, expand] sibling pair.
function walkContent(
	node: ADFEntity,
	imageMap: Record<string, UploadedImageData | null>,
	format: "png" | "svg",
): ADFEntity {
	if (!Array.isArray(node.content)) {
		return node;
	}

	const newContent: (ADFEntity | undefined)[] = [];
	let mutated = false;

	for (const child of node.content) {
		if (!child) {
			newContent.push(child);
			continue;
		}
		const replacementPair = tryRewritePlantumlCodeBlock(child, imageMap, format);
		if (replacementPair) {
			newContent.push(...replacementPair);
			mutated = true;
			continue;
		}
		const recursed = walkContent(child, imageMap, format);
		if (recursed !== child) {
			mutated = true;
		}
		newContent.push(recursed);
	}

	return mutated ? { ...node, content: newContent } : node;
}

function identity(error: unknown): unknown {
	return error;
}
