import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";
import yargs from "yargs";

export class CommandLineArgumentSettingsLoader extends SettingsLoader {
	getValue<T extends keyof ConfluenceSettings>(
		propertyKey: T,
		envVar: string,
	): Partial<ConfluenceSettings> {
		const value = process.env[envVar];
		return value ? { [propertyKey]: value } : {};
	}

	loadPartial(): Partial<ConfluenceSettings> {
		const options = yargs(process.argv)
			.usage("Usage: $0 [options]")
			.option("baseUrl", {
				alias: "b",
				describe: "Confluence base URL",
				type: "string",
				demandOption: false,
			})
			.option("parentId", {
				alias: "p",
				describe: "Confluence parent ID",
				type: "string",
				demandOption: false,
			})
			.option("userName", {
				alias: "u",
				describe: "Atlassian user name",
				type: "string",
				demandOption: false,
			})
			.option("apiToken", {
				describe: "Atlassian API token",
				type: "string",
				demandOption: false,
			})
			.option("enableFolder", {
				alias: "f",
				describe: "Folder enable to publish",
				type: "string",
				demandOption: false,
			})
			.option("contentRoot", {
				alias: "cr",
				describe:
					"Root to search for files to publish. All files must be part of this directory.",
				type: "string",
				demandOption: false,
			})
			.option("firstHeaderPageTitle", {
				alias: "fh",
				describe:
					"Replace page title with first header element when 'connie-title' isn't specified.",
				type: "boolean",
				demandOption: false,
			})
			.parseSync();

		return {
			...(options.baseUrl
				? { confluenceBaseUrl: options.baseUrl }
				: undefined),
			...(options.parentId
				? { confluenceParentId: options.parentId }
				: undefined),
			...(options.userName
				? { atlassianUserName: options.userName }
				: undefined),
			...(options.apiToken
				? { atlassianApiToken: options.apiToken }
				: undefined),
			...(options.enableFolder
				? { folderToPublish: options.enableFolder }
				: undefined),
			...(options.contentRoot
				? { contentRoot: options.contentRoot }
				: undefined),
			...(options.firstHeaderPageTitle
				? { firstHeadingPageTitle: options.firstHeaderPageTitle }
				: undefined),
		};
	}
}
