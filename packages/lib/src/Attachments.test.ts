import { expect, test } from "@effect/vitest";
import { Effect } from "effect";
import {
	BinaryFile,
	FilesToUpload,
	MarkdownFile,
	MarkdownWorkspace,
	MarkdownWorkspaceService,
} from "./MarkdownWorkspace";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { uploadBufferEffect, uploadFileEffect } from "./Attachments";

const pngBytes = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
	"base64",
);

test("fully decodes file URL components before reading binary files", async () => {
	const uploadRequests: unknown[] = [];
	const workspace = new TestMarkdownWorkspace((searchPath) =>
		searchPath === "file#name.png"
			? {
					filename: "file#name.png",
					filePath: "assets/file#name.png",
					mimeType: "image/png",
					contents: pngBytes,
				}
			: false,
	);

	const result = await Effect.runPromise(
		uploadFileEffect(
			makeConfluenceClient(uploadRequests),
			"page-id",
			"page.md",
			"file%23name.png",
			{},
		).pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
	);

	expect(result?.status).toBe("uploaded");
	const uploadRequestBody = await getUploadRequestBody(uploadRequests);
	expect(uploadRequestBody).toContain('name="file"; filename="');
	expect(uploadRequestBody).toContain('file#name.png"');
	expect(uploadRequestBody).toContain("Content-Type: image/png");
	expect(uploadRequestBody).toContain('name="minorEdit"\r\n\r\nfalse');
	expect(uploadRequestBody).toContain('name="comment"\r\n\r\n');
	expect(uploadRequestBody).not.toContain('name="minorEdit"; filename=');
	expect(uploadRequestBody).not.toContain('name="comment"; filename=');
});

test("derives upload buffer content type from the filename", async () => {
	const uploadRequests: unknown[] = [];

	const result = await Effect.runPromise(
		uploadBufferEffect(
			makeConfluenceClient(uploadRequests),
			"page-id",
			"notes.txt",
			Buffer.from("hello"),
			{},
		),
	);

	expect(result?.status).toBe("uploaded");
	expect(await getUploadRequestBody(uploadRequests)).toContain("Content-Type: text/plain");
});

test("falls back to octet-stream for unknown upload buffer file types", async () => {
	const uploadRequests: unknown[] = [];

	const result = await Effect.runPromise(
		uploadBufferEffect(
			makeConfluenceClient(uploadRequests),
			"page-id",
			"profile.not-a-known-type",
			Buffer.from("profile data"),
			{},
		),
	);

	expect(result?.status).toBe("uploaded");
	expect(await getUploadRequestBody(uploadRequests)).toContain(
		"Content-Type: application/octet-stream",
	);
});

test("uploads non-image files without requiring image dimensions", async () => {
	const uploadRequests: unknown[] = [];
	const workspace = new TestMarkdownWorkspace((searchPath) =>
		searchPath === "movie.mp4"
			? {
					filename: "movie.mp4",
					filePath: "assets/movie.mp4",
					mimeType: "video/mp4",
					contents: Buffer.from("not an image"),
				}
			: false,
	);

	const result = await Effect.runPromise(
		uploadFileEffect(
			makeConfluenceClient(uploadRequests),
			"page-id",
			"page.md",
			"movie.mp4",
			{},
		).pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
	);

	expect(result).toMatchObject({
		filename: "movie.mp4",
		height: 0,
		id: "file-id",
		status: "uploaded",
		width: 0,
	});
	expect(await getUploadRequestBody(uploadRequests)).toContain("Content-Type: video/mp4");
});

test("extracts SVG dimensions when image-size cannot detect them", async () => {
	const uploadRequests: unknown[] = [];
	const svgBytes = Buffer.from(
		'<?xml version="1.0"?><!----><svg xmlns="http://www.w3.org/2000/svg" width="1911px" height="1391px" viewBox="0 0 1911 1391"></svg>',
	);
	const workspace = new TestMarkdownWorkspace((searchPath) =>
		searchPath === "diagram.svg"
			? {
					filename: "diagram.svg",
					filePath: "img/diagram.svg",
					mimeType: "image/svg+xml",
					contents: svgBytes,
				}
			: false,
	);

	const result = await Effect.runPromise(
		uploadFileEffect(
			makeConfluenceClient(uploadRequests),
			"page-id",
			"page.md",
			"diagram.svg",
			{},
		).pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
	);

	expect(result?.width).toBe(1911);
	expect(result?.height).toBe(1391);
	expect(await getUploadRequestBody(uploadRequests)).toContain("Content-Type: image/svg+xml");
});

class TestMarkdownWorkspace implements MarkdownWorkspace {
	readonly getMarkdownFilesToUpload: Effect.Effect<FilesToUpload, Error> = Effect.succeed([]);

	constructor(private readonly binaryForPath: (searchPath: string) => BinaryFile | false) {}

	updateMarkdownValues(
		_absoluteFilePath: string,
		_values: Partial<ConfluencePerPageAllValues>,
	): Effect.Effect<void, Error> {
		return Effect.void;
	}

	loadMarkdownFile(_absoluteFilePath: string): Effect.Effect<MarkdownFile, Error> {
		return Effect.fail(new Error("Method not implemented."));
	}

	readBinary(searchPath: string): Effect.Effect<BinaryFile | false, Error> {
		return Effect.succeed(this.binaryForPath(searchPath));
	}

	readText(_searchPath: string): Effect.Effect<string | false, Error> {
		return Effect.fail(new Error("Method not implemented."));
	}
}

function makeConfluenceClient(uploadRequests: unknown[]): RequiredConfluenceClient {
	return {
		sendRequest: async (request: unknown) => {
			uploadRequests.push(request);
			return {
				results: [
					{
						extensions: {
							fileId: "file-id",
						},
						container: {
							id: "page-id",
						},
					},
				],
			};
		},
	} as unknown as RequiredConfluenceClient;
}

async function getUploadRequestBody(uploadRequests: unknown[]): Promise<string> {
	const request = uploadRequests[0] as { body: FormData } | undefined;
	if (!request) throw new Error("Missing upload request");
	return new Request("https://example.atlassian.net", {
		method: "PUT",
		body: request.body,
	}).text();
}
