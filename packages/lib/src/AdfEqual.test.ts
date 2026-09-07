import { expect, test } from "@effect/vitest";
import { ADFEntity } from "@atlaskit/adf-utils/types";
import { adfEqual } from "./AdfEqual";

test("ignores Confluence macro metadata when comparing raw ADF", () => {
	const serverAdf = docWithJiraMacro({
		macroParams: {
			jqlQuery: { value: "assignee=currentUser() AND resolution is empty" },
			maximumIssues: { value: "10" },
		},
		macroMetadata: {
			macroId: { value: "2b8fb396-76b2-43ac-81a8-aaf75bb8d229" },
			schemaVersion: { value: "1" },
			title: "Jira",
		},
	});
	const generatedAdf = docWithJiraMacro({
		macroParams: {
			jqlQuery: { value: "assignee=currentUser() AND resolution is empty" },
			maximumIssues: { value: "10" },
		},
	});

	expect(adfEqual(serverAdf, generatedAdf)).toBe(true);
	expect(getMacroParameters(serverAdf)["macroMetadata"]).toBeDefined();
});

test("keeps semantic macro parameter differences in the ADF comparison", () => {
	const serverAdf = docWithJiraMacro({
		macroParams: {
			jqlQuery: { value: "assignee=currentUser() AND resolution is empty" },
			maximumIssues: { value: "10" },
		},
		macroMetadata: {
			macroId: { value: "2b8fb396-76b2-43ac-81a8-aaf75bb8d229" },
		},
	});
	const generatedAdf = docWithJiraMacro({
		macroParams: {
			jqlQuery: { value: "project = DOCS" },
			maximumIssues: { value: "10" },
		},
	});

	expect(adfEqual(serverAdf, generatedAdf)).toBe(false);
});

test("server-added TOC page context does not trigger another update after conflict recovery", () => {
	const generated = docWithJiraMacro({ macroParams: { minLevel: { value: "2" } } });
	generated.content![0]!.attrs!["extensionKey"] = "toc";
	const stored = structuredClone(generated);
	const parameters = getMacroParameters(stored);
	const options = parameters["macroParams"] as Record<string, unknown>;
	options["_parentId"] = { value: "988774859" };
	expect(adfEqual(stored, generated)).toBe(true);
	expect(options["_parentId"]).toEqual({ value: "988774859" });
	options["minLevel"] = { value: "3" };
	expect(adfEqual(stored, generated)).toBe(false);
	options["minLevel"] = { value: "2" };
	for (const document of [stored, generated])
		document.content![0]!.attrs!["extensionKey"] = "jira";
	expect(adfEqual(stored, generated)).toBe(false);
});

function docWithJiraMacro(parameters: Record<string, unknown>): ADFEntity {
	return {
		type: "doc",
		version: 1,
		content: [
			{
				type: "extension",
				attrs: {
					layout: "full-width",
					extensionType: "com.atlassian.confluence.macro.core",
					extensionKey: "jira",
					parameters,
				},
			},
		],
	} as ADFEntity;
}

function getMacroParameters(adf: ADFEntity): Record<string, unknown> {
	const extension = adf.content?.[0];
	if (!extension?.attrs || typeof extension.attrs !== "object") {
		throw new Error("Missing extension attrs");
	}

	const parameters = extension.attrs["parameters"];
	if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
		throw new Error("Missing extension parameters");
	}

	return parameters as Record<string, unknown>;
}

test("ignores Confluence page-title slugs while retaining page, anchor and origin differences", () => {
	const link = (href: string): ADFEntity => ({
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [
					{ type: "text", text: "Page", marks: [{ type: "link", attrs: { href } }] },
				],
			},
		],
	});
	const base = "https://example.atlassian.net/wiki/spaces/DOCS/pages/123";
	expect(adfEqual(link(base + "/Page+Title#Heading"), link(base + "#Heading"))).toBe(true);
	expect(adfEqual(link(base + "#One"), link(base + "#Two"))).toBe(false);
	expect(adfEqual(link(base), link(base.replace("123", "124")))).toBe(false);
	expect(adfEqual(link(base), link(base.replace("example", "different")))).toBe(false);
});

test("ignores redundant server image width while retaining explicit resizing", () => {
	const media = (width?: number): ADFEntity => ({
		type: "doc",
		version: 1,
		content: [
			{
				type: "mediaSingle",
				attrs: {
					layout: "center",
					...(width === undefined ? {} : { width, widthType: "pixel" }),
				},
				content: [
					{
						type: "media",
						attrs: {
							type: "file",
							id: "image",
							collection: "page",
							width: 160,
							height: 80,
						},
					},
				],
			},
		],
	});
	expect(adfEqual(media(160), media())).toBe(true);
	expect(adfEqual(media(80), media())).toBe(false);
});

test("ignores asynchronous Confluence link metadata without changing input or authored link fields", () => {
	const original: ADFEntity = {
		type: "doc",
		version: 1,
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: "Child page",
						marks: [
							{
								type: "link",
								attrs: {
									href: "https://example.atlassian.net/wiki/spaces/D/pages/123#Heading",
									title: "Authored title",
								},
							},
						],
					},
				],
			},
		],
	};
	const stored = structuredClone(original);
	const attrs = stored.content![0]!.content![0]!.marks![0]!.attrs!;
	attrs["href"] = "https://example.atlassian.net/wiki/spaces/D/pages/123/Page+Title#Heading";
	attrs["__confluenceMetadata"] = {
		isRenamedTitle: true,
		linkType: "page",
		contentTitle: "Page Title",
		versionAtSave: "1",
		anchorName: "Heading",
	};
	expect(adfEqual(original, stored)).toBe(true);
	expect(attrs["__confluenceMetadata"]).toBeDefined();
	attrs["title"] = "Changed authored title";
	expect(adfEqual(original, stored)).toBe(false);
	attrs["title"] = "Authored title";
	attrs["href"] = "https://example.atlassian.net/wiki/spaces/D/pages/123#Another-heading";
	expect(adfEqual(original, stored)).toBe(false);
});

test("ignores transient server media metadata without mutating exports", () => {
	const generated: ADFEntity = {
		type: "media",
		attrs: { type: "file", id: "image-id", collection: "contentId-1", width: 160 },
	};
	const server: ADFEntity = {
		type: "media",
		attrs: {
			...generated.attrs,
			__fileName: "image.png",
			__fileSize: 269,
			__fileMimeType: "image/png",
		},
	};
	expect(adfEqual(server, generated)).toBe(true);
	expect(server.attrs?.["__fileName"]).toBe("image.png");
	for (const attrs of [{ id: "other-image" }, { collection: "contentId-2" }, { width: 80 }]) {
		expect(adfEqual(server, { type: "media", attrs: { ...generated.attrs, ...attrs } })).toBe(
			false,
		);
	}
});
