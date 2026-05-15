import { expect, test } from "@jest/globals";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { Publisher } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
import { StaticSettingsLoader } from "./SettingsLoader";
import {
	BinaryFile,
	FilesToUpload,
	LoaderAdaptor,
	MarkdownFile,
	RequiredConfluenceClient,
} from "./adaptors";

test("explains how to resolve a missing parent page space key", async () => {
	const publisher = new Publisher(
		new UnusedAdaptor(),
		new StaticSettingsLoader(testSettings),
		createConfluenceClientWithoutParentSpace(),
		[],
	);

	await expect(publisher.publish()).rejects.toThrow(
		/Missing Space Key for Confluence page "123456"\. .*there is no separate space-key setting.*set confluenceBaseUrl to the Atlassian site URL without \/wiki/,
	);
});

class UnusedAdaptor implements LoaderAdaptor {
	async updateMarkdownValues(
		_absoluteFilePath: string,
		_values: Partial<ConfluencePerPageAllValues>,
	): Promise<void> {
		throw new Error("Method not implemented.");
	}

	async loadMarkdownFile(_absoluteFilePath: string): Promise<MarkdownFile> {
		throw new Error("Method not implemented.");
	}

	async getMarkdownFilesToUpload(): Promise<FilesToUpload> {
		throw new Error("Method not implemented.");
	}

	async readBinary(
		_path: string,
		_referencedFromFilePath: string,
	): Promise<BinaryFile | false> {
		throw new Error("Method not implemented.");
	}
}

function createConfluenceClientWithoutParentSpace(): RequiredConfluenceClient {
	return {
		users: {
			getCurrentUser: async () => ({ accountId: "current-user" }),
		},
		content: {
			getContentById: async () => ({
				id: testSettings.confluenceParentId,
			}),
		},
		contentAttachments: {},
		contentLabels: {},
		space: {},
	} as unknown as RequiredConfluenceClient;
}

const testSettings: ConfluenceSettings = {
	confluenceBaseUrl: "https://example.atlassian.net",
	confluenceParentId: "123456",
	atlassianUserName: "user@example.com",
	atlassianApiToken: "token",
	folderToPublish: ".",
	contentRoot: ".",
	firstHeadingPageTitle: false,
};
