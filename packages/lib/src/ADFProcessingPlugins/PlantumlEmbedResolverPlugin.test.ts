/* eslint-disable @typescript-eslint/naming-convention */
import { expect, test } from "@effect/vitest";
import { Effect } from "effect";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { BinaryFile, FilesToUpload, MarkdownFile, MarkdownWorkspace } from "../MarkdownWorkspace";
import { ConfluencePerPageAllValues } from "../ConniePageConfig";
import { PlantumlEmbedResolverPlugin } from "./PlantumlEmbedResolverPlugin";

class StubWorkspace implements MarkdownWorkspace {
	textCalls: { path: string; from: string }[] = [];
	readonly getMarkdownFilesToUpload: Effect.Effect<FilesToUpload, Error> = Effect.fail(
		new Error("not used"),
	);

	constructor(private readonly files: Record<string, string | false>) {}

	updateMarkdownValues(
		_absoluteFilePath: string,
		_values: Partial<ConfluencePerPageAllValues>,
	): Effect.Effect<void, Error> {
		return Effect.void;
	}

	loadMarkdownFile(_absoluteFilePath: string): Effect.Effect<MarkdownFile, Error> {
		return Effect.fail(new Error("not used"));
	}

	readBinary(_path: string, _from: string): Effect.Effect<BinaryFile | false, Error> {
		return Effect.fail(new Error("not used"));
	}

	readText(
		searchPath: string,
		referencedFromFilePath: string,
	): Effect.Effect<string | false, Error> {
		this.textCalls.push({ path: searchPath, from: referencedFromFilePath });
		return Effect.succeed(this.files[searchPath] ?? false);
	}
}

function makeMediaSingleEmbed(url: string): unknown {
	return {
		type: "mediaSingle",
		attrs: { layout: "center" },
		content: [{ type: "media", attrs: { type: "file", url } }],
	};
}

function docOf(...blocks: unknown[]): JSONDocNode {
	return { version: 1, type: "doc", content: blocks } as unknown as JSONDocNode;
}

function run(adf: JSONDocNode, workspace: MarkdownWorkspace, pageFilePath: string) {
	return Effect.runPromise(
		PlantumlEmbedResolverPlugin.preprocess(adf, { workspace, pageFilePath }) as Effect.Effect<
			JSONDocNode,
			unknown,
			never
		>,
	);
}

test("rewrites .puml mediaSingle embeds to plantuml codeBlocks with file contents", async () => {
	const workspace = new StubWorkspace({ "example.puml": "@startuml\nA -> B\n@enduml" });
	const adf = docOf(makeMediaSingleEmbed("file://example.puml"));

	const result = await run(adf, workspace, "/Notes/page.md");

	const block = (
		result as unknown as {
			content: {
				type: string;
				attrs?: { language?: string };
				content?: { text?: string }[];
			}[];
		}
	).content[0];
	expect(block?.type).toBe("codeBlock");
	expect(block?.attrs?.language).toBe("plantuml");
	expect(block?.content?.[0]?.text).toBe("@startuml\nA -> B\n@enduml");
	expect(workspace.textCalls).toEqual([{ path: "example.puml", from: "/Notes/page.md" }]);
});

test("recognizes .iuml and .plantuml extensions, case-insensitive", async () => {
	const workspace = new StubWorkspace({
		"snippet.IUML": "skinparam monochrome true",
		"diagram.Plantuml": "@startuml\nC -> D\n@enduml",
	});
	const adf = docOf(
		makeMediaSingleEmbed("file://snippet.IUML"),
		makeMediaSingleEmbed("file://diagram.Plantuml"),
	);

	const result = await run(adf, workspace, "/p.md");

	const blocks = (result as unknown as { content: { type: string }[] }).content;
	expect(blocks[0]?.type).toBe("codeBlock");
	expect(blocks[1]?.type).toBe("codeBlock");
});

test("decodes URL-encoded paths (e.g. spaces) before lookup", async () => {
	const workspace = new StubWorkspace({ "my diagram.puml": "@startuml\nA -> B\n@enduml" });
	const adf = docOf(makeMediaSingleEmbed("file://my%20diagram.puml"));

	const result = await run(adf, workspace, "/p.md");

	const block = (result as unknown as { content: { type: string }[] }).content[0];
	expect(block?.type).toBe("codeBlock");
});

test("leaves non-plantuml media embeds untouched", async () => {
	const workspace = new StubWorkspace({});
	const adf = docOf(makeMediaSingleEmbed("file://photo.png"));

	const result = await run(adf, workspace, "/p.md");

	const block = (result as unknown as { content: { type: string }[] }).content[0];
	expect(block?.type).toBe("mediaSingle");
	expect(workspace.textCalls).toHaveLength(0);
});

test("leaves non-file (external URL) media embeds untouched", async () => {
	const workspace = new StubWorkspace({});
	const adf = docOf({
		type: "mediaSingle",
		attrs: {},
		content: [
			{ type: "media", attrs: { type: "external", url: "https://example.com/x.puml" } },
		],
	});

	const result = await run(adf, workspace, "/p.md");

	const block = (result as unknown as { content: { type: string }[] }).content[0];
	expect(block?.type).toBe("mediaSingle");
});

test("leaves the embed in place when the file cannot be read", async () => {
	const workspace = new StubWorkspace({});
	const adf = docOf(makeMediaSingleEmbed("file://missing.puml"));

	const result = await run(adf, workspace, "/p.md");

	const block = (result as unknown as { content: { type: string }[] }).content[0];
	expect(block?.type).toBe("mediaSingle");
});

test("leaves the embed in place when the file is empty", async () => {
	const workspace = new StubWorkspace({ "empty.puml": "   \n  " });
	const adf = docOf(makeMediaSingleEmbed("file://empty.puml"));

	const result = await run(adf, workspace, "/p.md");

	const block = (result as unknown as { content: { type: string }[] }).content[0];
	expect(block?.type).toBe("mediaSingle");
});

test("walks nested content (e.g. embeds inside panels)", async () => {
	const workspace = new StubWorkspace({ "example.puml": "@startuml\nA -> B\n@enduml" });
	const adf = docOf({
		type: "panel",
		attrs: {},
		content: [makeMediaSingleEmbed("file://example.puml")],
	});

	const result = await run(adf, workspace, "/p.md");

	const panel = (result as unknown as { content: { content: { type: string }[] }[] }).content[0];
	expect(panel?.content[0]?.type).toBe("codeBlock");
});
