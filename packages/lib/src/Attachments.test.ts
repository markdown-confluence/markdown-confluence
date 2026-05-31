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
	const uploadRequestBody = getUploadRequestBody(uploadRequests);
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
	expect(getUploadRequestBody(uploadRequests)).toContain("Content-Type: text/plain");
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

function getUploadRequestBody(uploadRequests: unknown[]): string {
	const request = uploadRequests[0] as
		| {
				data: {
					getBuffer(): Buffer;
				};
		  }
		| undefined;
	if (!request) {
		throw new Error("Missing upload request");
	}

	return request.data.getBuffer().toString();
}
