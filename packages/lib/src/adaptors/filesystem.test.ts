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
		join("thingy", "mydude.md"),
	]);
});

test("updates markdown values for a cwd-relative file path inside contentRoot", async () => {
	tmpRoot = await mkdtemp(join(tmpdir(), "markdown-confluence-"));
	originalWorkingDirectory = process.cwd();
	process.chdir(tmpRoot);

	await mkdir("src/development", { recursive: true });
	await writeFile("src/development/page.md", "# Page");

	const adaptor = new FileSystemAdaptor({
		...testSettings,
		contentRoot: "./src/",
	});

	await adaptor.updateMarkdownValues(join("src", "development", "page.md"), {
		publish: true,
		pageId: "123456",
	});

	const fileContent = await adaptor.getFileContent(
		join(tmpRoot, "src", "development", "page.md"),
	);
	expect(fileContent.data["connie-publish"]).toBe(true);
	expect(String(fileContent.data["connie-page-id"])).toBe("123456");
});

test("updates markdown values for an absolute file path inside contentRoot", async () => {
	tmpRoot = await mkdtemp(join(tmpdir(), "markdown-confluence-"));
	originalWorkingDirectory = process.cwd();
	process.chdir(tmpRoot);

	await mkdir("src/development", { recursive: true });
	await writeFile("src/development/page.md", "# Page");

	const adaptor = new FileSystemAdaptor({
		...testSettings,
		contentRoot: "./src/",
	});
	const filePath = join(tmpRoot, "src", "development", "page.md");

	await adaptor.updateMarkdownValues(filePath, {
		publish: true,
		pageId: "234567",
	});

	const fileContent = await adaptor.getFileContent(filePath);
	expect(fileContent.data["connie-publish"]).toBe(true);
	expect(String(fileContent.data["connie-page-id"])).toBe("234567");
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
