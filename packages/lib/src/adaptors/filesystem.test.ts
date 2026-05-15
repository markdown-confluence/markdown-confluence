import { afterEach, expect, test } from "@jest/globals";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ConfluenceSettings } from "../Settings";
import { FileSystemAdaptor } from "./filesystem";

let tmpRoot: string | undefined;
let originalWorkingDirectory: string | undefined;

afterEach(async () => {
	if (originalWorkingDirectory) {
		process.chdir(originalWorkingDirectory);
		originalWorkingDirectory = undefined;
	}

	if (tmpRoot) {
		await rm(tmpRoot, { recursive: true, force: true });
		tmpRoot = undefined;
	}
});

test("matches folderToPublish under a relative contentRoot", async () => {
	tmpRoot = await mkdtemp(join(tmpdir(), "markdown-confluence-"));
	originalWorkingDirectory = process.cwd();
	process.chdir(tmpRoot);

	await mkdir("phil/thingy", { recursive: true });
	await writeFile("phil/index.md", "# Index");
	await writeFile("phil/thingy/mydude.md", "# My Dude");

	const adaptor = new FileSystemAdaptor({
		...testSettings,
		contentRoot: "./phil/",
		folderToPublish: "thingy",
	});

	const files = await adaptor.getMarkdownFilesToUpload();

	expect(files.map((file) => file.absoluteFilePath)).toEqual([
		"thingy/mydude.md",
	]);
});

const testSettings: ConfluenceSettings = {
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "123456",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};
