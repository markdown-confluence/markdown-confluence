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
