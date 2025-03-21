import { describe, expect, test } from "@jest/globals";
import { LogLevel } from "../../utils/Logger";
import {
	ConfluencePerPageUIValues,
	FailedFile,
	ObsidianPluginSettings,
	PublishMapping,
	UploadResults
} from "../Types";

describe("Types", () => {
	describe("PublishMapping", () => {
		test("should create a valid PublishMapping with all properties", () => {
			const mapping: PublishMapping = {
				confluenceParentId: "12345",
				folderToPublish: "/path/to/folder",
				label: "Test Mapping"
			};

			expect(mapping.confluenceParentId).toBe("12345");
			expect(mapping.folderToPublish).toBe("/path/to/folder");
			expect(mapping.label).toBe("Test Mapping");
		});

		test("should create a valid PublishMapping without optional label", () => {
			const mapping: PublishMapping = {
				confluenceParentId: "12345",
				folderToPublish: "/path/to/folder"
			};

			expect(mapping.confluenceParentId).toBe("12345");
			expect(mapping.folderToPublish).toBe("/path/to/folder");
			expect(mapping.label).toBeUndefined();
		});
	});

	describe("ObsidianPluginSettings", () => {
		test("should create valid ObsidianPluginSettings with all properties", () => {
			const settings = {
				confluenceBaseUrl: "https://example.atlassian.net/wiki",
				confluenceParentId: "12345",
				contentRoot: "/content/",
				folderToPublish: "/content/folder",
				atlassianUserName: "user@example.com",
				atlassianApiToken: "api-token",
				includeAllMdFiles: false,
				markdownContentReplacementRules: {},
				labels: ["test-label"],
				mermaidTheme: "match-obsidian" as const,
				logLevel: LogLevel.INFO,
				publishMappings: [
					{
						confluenceParentId: "12345",
						folderToPublish: "/content/folder",
						label: "Main Folder"
					}
				],
				activeMappingIndex: 0
			} as ObsidianPluginSettings;

			expect(settings.confluenceBaseUrl).toBe("https://example.atlassian.net/wiki");
			expect(settings.mermaidTheme).toBe("match-obsidian");
			expect(settings.logLevel).toBe(LogLevel.INFO);
			expect(settings.publishMappings).toHaveLength(1);
			expect(settings.activeMappingIndex).toBe(0);
		});

		test("should accept different mermaidTheme values", () => {
			const themes: Array<ObsidianPluginSettings["mermaidTheme"]> = [
				"match-obsidian",
				"light-obsidian",
				"dark-obsidian",
				"default",
				"neutral",
				"dark",
				"forest"
			];

			themes.forEach(theme => {
				const settings: Pick<ObsidianPluginSettings, "mermaidTheme"> = {
					mermaidTheme: theme
				};
				expect(settings.mermaidTheme).toBe(theme);
			});
		});
	});

	describe("FailedFile", () => {
		test("should create a valid FailedFile", () => {
			const failedFile: FailedFile = {
				fileName: "example.md",
				reason: "Failed to upload"
			};

			expect(failedFile.fileName).toBe("example.md");
			expect(failedFile.reason).toBe("Failed to upload");
		});
	});

	describe("UploadResults", () => {
		test("should create valid UploadResults with success", () => {
			const results = {
				errorMessage: null,
				failedFiles: [],
				filesUploadResult: [
					{
						title: "Example",
						pageId: "12345",
						status: "created"
					}
				]
			} as UploadResults;

			expect(results.errorMessage).toBeNull();
			expect(results.failedFiles).toHaveLength(0);
			expect(results.filesUploadResult).toHaveLength(1);

			const result = results.filesUploadResult[0] as unknown;
			expect((result as { pageId: string }).pageId).toBe("12345");
			expect((result as { title: string }).title).toBe("Example");
		});

		test("should create valid UploadResults with failures", () => {
			const results: UploadResults = {
				errorMessage: "Some files failed to upload",
				failedFiles: [
					{
						fileName: "example.md",
						reason: "Network error"
					}
				],
				filesUploadResult: []
			};

			expect(results.errorMessage).toBe("Some files failed to upload");
			expect(results.failedFiles).toHaveLength(1);

			const failedFile = results.failedFiles[0];
			expect(failedFile?.fileName).toBe("example.md");
			expect(failedFile?.reason).toBe("Network error");

			expect(results.filesUploadResult).toHaveLength(0);
		});
	});

	describe("ConfluencePerPageUIValues", () => {
		test("should create valid ConfluencePerPageUIValues", () => {
			const values: ConfluencePerPageUIValues = {
				"option1": {
					isSet: true,
					value: "test value"
				},
				"option2": {
					isSet: false,
					value: 42
				}
			};

			const option1 = values["option1"];
			const option2 = values["option2"];

			expect(option1?.isSet).toBe(true);
			expect(option1?.value).toBe("test value");
			expect(option2?.isSet).toBe(false);
			expect(option2?.value).toBe(42);
		});
	});
}); 