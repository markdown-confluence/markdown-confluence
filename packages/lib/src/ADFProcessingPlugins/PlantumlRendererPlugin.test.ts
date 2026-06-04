/* eslint-disable @typescript-eslint/naming-convention */
import { expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { UploadedImageData } from "../Attachments";
import { ChartData } from "./MermaidRendererPlugin";
import { PublisherFunctions } from "./types";
import {
	PlantumlRenderer,
	PlantumlRendererPlugin,
	getPlantumlFileName,
} from "./PlantumlRendererPlugin";

class StubPlantumlRenderer implements PlantumlRenderer {
	captured: ChartData[] = [];

	constructor(private readonly result: Map<string, Buffer> = new Map()) {}

	async capturePlantumlCharts(charts: ChartData[]): Promise<Map<string, Buffer>> {
		this.captured = charts;
		return this.result;
	}
}

const noopSupportFunctions: PublisherFunctions = {
	uploadBuffer: async (filename: string): Promise<UploadedImageData | null> => ({
		filename,
		id: `id-${filename}`,
		collection: "test",
		width: 100,
		height: 100,
		status: "uploaded",
	}),
	uploadBufferEffect: (filename: string) =>
		Effect.succeed({
			filename,
			id: `id-${filename}`,
			collection: "test",
			width: 100,
			height: 100,
			status: "uploaded" as const,
		}),
	uploadFile: async () => null,
	uploadFileEffect: () => Effect.succeed(null),
};

function makeDoc(
	blocks: { language: string; text: string }[],
	extras: unknown[] = [],
): JSONDocNode {
	return {
		version: 1,
		type: "doc",
		content: [
			...blocks.map((block) => ({
				type: "codeBlock",
				attrs: { language: block.language },
				content: [{ type: "text", text: block.text }],
			})),
			...(extras as []),
		],
	} as unknown as JSONDocNode;
}

test("extract picks up plantuml/puml/uml language tags case-insensitively", () => {
	const renderer = new StubPlantumlRenderer();
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([
		{ language: "plantuml", text: "@startuml\nA -> B\n@enduml" },
		{ language: "PUML", text: "@startuml\nC -> D\n@enduml" },
		{ language: "Uml", text: "@startuml\nE -> F\n@enduml" },
		{ language: "mermaid", text: "flowchart LR\nA --> B" },
		{ language: "javascript", text: "console.log(1)" },
	]);

	const charts = plugin.extract(doc);

	expect(charts).toHaveLength(3);
	const sources = charts.map((c) => c.data);
	expect(sources).toContain("@startuml\nA -> B\n@enduml");
	expect(sources).toContain("@startuml\nC -> D\n@enduml");
	expect(sources).toContain("@startuml\nE -> F\n@enduml");
});

test("extract dedupes identical plantuml sources", () => {
	const renderer = new StubPlantumlRenderer();
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([
		{ language: "plantuml", text: "@startuml\nA -> B\n@enduml" },
		{ language: "puml", text: "@startuml\nA -> B\n@enduml" },
	]);

	expect(plugin.extract(doc)).toHaveLength(1);
});

test("extract skips empty/whitespace plantuml blocks (no synthetic fallback)", () => {
	const renderer = new StubPlantumlRenderer();
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([
		{ language: "plantuml", text: "" },
		{ language: "puml", text: "   \n  \t" },
		{ language: "uml", text: "@startuml\nA -> B\n@enduml" },
	]);

	const charts = plugin.extract(doc);
	expect(charts).toHaveLength(1);
	expect(charts[0]?.data).toBe("@startuml\nA -> B\n@enduml");
});

test("extract wraps bare snippets (.iuml-style) in @startuml/@enduml for hashing", () => {
	const renderer = new StubPlantumlRenderer();
	const plugin = new PlantumlRendererPlugin(renderer);
	const bare = "skinparam monochrome true\nAlice -> Bob";
	const doc = makeDoc([{ language: "plantuml", text: bare }]);

	const charts = plugin.extract(doc);
	expect(charts).toHaveLength(1);
	expect(charts[0]?.data).toBe(`@startuml\n${bare}\n@enduml`);
});

test("getPlantumlFileName is deterministic and falls back on empty", () => {
	const a = getPlantumlFileName("@startuml\nA -> B\n@enduml");
	const b = getPlantumlFileName("@startuml\nA -> B\n@enduml");
	expect(a.uploadFilename).toBe(b.uploadFilename);
	expect(a.uploadFilename).toMatch(/^RenderedPlantumlChart-[0-9a-f]+\.png$/);

	const fallback = getPlantumlFileName(undefined);
	expect(fallback.plantumlText).toBe("@startuml\nAlice -> Bob\n@enduml");
});

test("transform returns empty map when nothing to render and skips the renderer", async () => {
	const renderer = new StubPlantumlRenderer();
	const plugin = new PlantumlRendererPlugin(renderer);
	const result = await plugin.transform([], noopSupportFunctions);
	expect(result).toEqual({});
	expect(renderer.captured).toHaveLength(0);
});

test("load replaces matched codeBlocks with mediaSingle plus a sibling source expand", async () => {
	const sample = "@startuml\nA -> B\n@enduml";
	const { uploadFilename } = getPlantumlFileName(sample);
	const renderer = new StubPlantumlRenderer(
		new Map<string, Buffer>([[uploadFilename, Buffer.from("png")]]),
	);
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([
		{ language: "plantuml", text: sample },
		{ language: "javascript", text: "console.log(1)" },
	]);

	const charts = plugin.extract(doc);
	const imageMap = await plugin.transform(charts, noopSupportFunctions);
	const finalAdf = plugin.load(doc, imageMap);

	const content = (
		finalAdf as unknown as {
			content: {
				type: string;
				attrs?: { title?: string; language?: string };
				content?: {
					type: string;
					attrs?: { language?: string };
					content?: { text?: string }[];
				}[];
			}[];
		}
	).content;
	expect(content[0]?.type).toBe("mediaSingle");
	expect(content[1]?.type).toBe("expand");
	expect(content[1]?.attrs?.title).toBe("source");
	const innerCodeBlock = content[1]?.content?.[0];
	expect(innerCodeBlock?.type).toBe("codeBlock");
	expect(innerCodeBlock?.attrs?.language).toBe("plaintext");
	expect(innerCodeBlock?.content?.[0]?.text).toBe(sample);
	expect(content[2]?.type).toBe("codeBlock");
});

test("load leaves codeBlock alone when imageMap entry missing", async () => {
	const renderer = new StubPlantumlRenderer(new Map());
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([{ language: "plantuml", text: "@startuml\nA -> B\n@enduml" }]);

	const charts = plugin.extract(doc);
	const imageMap = await plugin.transform(charts, noopSupportFunctions);
	const finalAdf = plugin.load(doc, imageMap);
	const content = (finalAdf as unknown as { content: { type: string }[] }).content;
	expect(content[0]?.type).toBe("codeBlock");
	expect(content).toHaveLength(1);
});

test("load source expand uses normalized text for bare snippets", async () => {
	const bare = "skinparam monochrome true\nAlice -> Bob";
	const wrapped = `@startuml\n${bare}\n@enduml`;
	const { uploadFilename } = getPlantumlFileName(bare);
	const renderer = new StubPlantumlRenderer(
		new Map<string, Buffer>([[uploadFilename, Buffer.from("png")]]),
	);
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([{ language: "plantuml", text: bare }]);

	const charts = plugin.extract(doc);
	const imageMap = await plugin.transform(charts, noopSupportFunctions);
	const finalAdf = plugin.load(doc, imageMap);

	const content = (
		finalAdf as unknown as { content: { content?: { content?: { text?: string }[] }[] }[] }
	).content;
	expect(content[1]?.content?.[0]?.content?.[0]?.text).toBe(wrapped);
});

test("load emits one [mediaSingle, expand] pair per matched plantuml code block", async () => {
	const a = "@startuml\nA -> B\n@enduml";
	const b = "@startuml\nC -> D\n@enduml";
	const fileA = getPlantumlFileName(a).uploadFilename;
	const fileB = getPlantumlFileName(b).uploadFilename;
	const renderer = new StubPlantumlRenderer(
		new Map<string, Buffer>([
			[fileA, Buffer.from("a")],
			[fileB, Buffer.from("b")],
		]),
	);
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([
		{ language: "plantuml", text: a },
		{ language: "puml", text: b },
	]);

	const charts = plugin.extract(doc);
	const imageMap = await plugin.transform(charts, noopSupportFunctions);
	const finalAdf = plugin.load(doc, imageMap);

	const content = (finalAdf as unknown as { content: { type: string }[] }).content;
	expect(content.map((c) => c?.type)).toEqual(["mediaSingle", "expand", "mediaSingle", "expand"]);
});

test("load does not mutate the input ADF", async () => {
	const sample = "@startuml\nA -> B\n@enduml";
	const { uploadFilename } = getPlantumlFileName(sample);
	const renderer = new StubPlantumlRenderer(
		new Map<string, Buffer>([[uploadFilename, Buffer.from("png")]]),
	);
	const plugin = new PlantumlRendererPlugin(renderer);
	const doc = makeDoc([{ language: "plantuml", text: sample }]);
	const before = JSON.stringify(doc);

	const charts = plugin.extract(doc);
	const imageMap = await plugin.transform(charts, noopSupportFunctions);
	plugin.load(doc, imageMap);

	expect(JSON.stringify(doc)).toBe(before);
});
