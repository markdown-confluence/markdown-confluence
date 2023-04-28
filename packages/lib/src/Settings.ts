import fs from "fs";
import path from "path";
import yargs from "yargs";

export class ConfluenceSettings {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
	contentRoot: string;
}

export const DEFAULT_SETTINGS = new ConfluenceSettings();
DEFAULT_SETTINGS.confluenceBaseUrl = "";
DEFAULT_SETTINGS.confluenceParentId = "";
DEFAULT_SETTINGS.atlassianUserName = "";
DEFAULT_SETTINGS.atlassianApiToken = "";
DEFAULT_SETTINGS.folderToPublish = "Confluence Pages";
DEFAULT_SETTINGS.contentRoot = process.cwd();

export abstract class SettingsLoader {
	abstract loadPartial(): Partial<ConfluenceSettings>;

	load(): ConfluenceSettings {
		const initialSettings = this.loadPartial();
		const settings = this.validateSettings(initialSettings);
		return settings;
	}

	protected validateSettings(
		settings: Partial<ConfluenceSettings>
	): ConfluenceSettings {
		if (!settings.confluenceBaseUrl) {
			throw new Error("Confluence base URL is required");
		}

		if (!settings.confluenceParentId) {
			throw new Error("Confluence parent ID is required");
		}

		if (!settings.atlassianUserName) {
			throw new Error("Atlassian user name is required");
		}

		if (!settings.atlassianApiToken) {
			throw new Error("Atlassian API token is required");
		}

		if (!settings.folderToPublish) {
			throw new Error("Folder to publish is required");
		}

		if (!settings.contentRoot) {
			throw new Error("Content root is required");
		} else {
			if (!settings.contentRoot.endsWith("/")) {
				settings.contentRoot += "/";
			}
		}

		return settings as ConfluenceSettings;
	}
}

export class DefaultSettingsLoader extends SettingsLoader {
	loadPartial(): Partial<ConfluenceSettings> {
		return DEFAULT_SETTINGS;
	}
}

export class StaticSettingsLoader extends SettingsLoader {
	constructor(private settings: Partial<ConfluenceSettings>) {
		super();
	}

	loadPartial(): Partial<ConfluenceSettings> {
		return this.settings;
	}
}

export class EnvironmentVariableSettingsLoader extends SettingsLoader {
	loadPartial(): Partial<ConfluenceSettings> {
		return {
			confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL,
			confluenceParentId: process.env.CONFLUENCE_PARENT_ID,
			atlassianUserName: process.env.ATLASSIAN_USERNAME,
			atlassianApiToken: process.env.ATLASSIAN_API_TOKEN,
			folderToPublish: process.env.FOLDER_TO_PUBLISH,
			contentRoot: process.env.CONFLUENCE_CONTENT_ROOT,
		};
	}
}

export class ConfigFileSettingsLoader extends SettingsLoader {
	private configPath: string = path.join(
		process.env.HOME ?? "",
		".markdown-confluence.json"
	);

	constructor(configPath?: string) {
		super();

		if (configPath) {
			this.configPath = configPath;
			return;
		}

		if (
			"CONFLUENCE_CONFIG_FILE" in process.env &&
			process.env.CONFLUENCE_CONFIG_FILE
		) {
			this.configPath = process.env.CONFLUENCE_CONFIG_FILE;
		}

		const options = yargs(process.argv)
			.option("config", {
				alias: "c",
				describe: "Path to the config file",
				type: "string",
				default: this.configPath,
				demandOption: false,
			})
			.parseSync();

		this.configPath = options.config;
	}

	loadPartial(): Partial<ConfluenceSettings> {
		try {
			const configData = fs.readFileSync(this.configPath, {
				encoding: "utf-8",
			});
			const config = JSON.parse(configData);

			const result: Partial<ConfluenceSettings> = {};

			for (const key in DEFAULT_SETTINGS) {
				if (Object.prototype.hasOwnProperty.call(config, key)) {
					const element = config[key as keyof ConfluenceSettings];
					if (element) {
						result[key as keyof ConfluenceSettings] = element;
					}
				}
			}

			return result;
		} catch {
			return {};
		}
	}
}

export class CommandLineArgumentSettingsLoader extends SettingsLoader {
	loadPartial(): Partial<ConfluenceSettings> {
		const options = yargs(process.argv)
			.usage("Usage: $0 [options]")
			.option("config", {
				alias: "c",
				describe: "Path to the config file",
				type: "string",
				default: path.join(
					process.env.HOME ?? "",
					".mermaid-confluence.json"
				),
				demandOption: false,
			})
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
			.parseSync();

		return {
			confluenceBaseUrl: options.baseUrl,
			confluenceParentId: options.parentId,
			atlassianUserName: options.userName,
			atlassianApiToken: options.apiToken,
			folderToPublish: options.enableFolder,
			contentRoot: options.contentRoot,
		};
	}
}

export class AutoSettingsLoader extends SettingsLoader {
	constructor(private loaders: SettingsLoader[] = []) {
		super();

		if (loaders.length === 0) {
			this.loaders.push(new DefaultSettingsLoader());
			this.loaders.push(new ConfigFileSettingsLoader());
			this.loaders.push(new EnvironmentVariableSettingsLoader());
			this.loaders.push(new CommandLineArgumentSettingsLoader());
		}
	}

	private combineSettings(): ConfluenceSettings {
		let settings: Partial<ConfluenceSettings> = {};

		for (const loader of this.loaders) {
			const partialSettings = loader.loadPartial();
			for (const key in partialSettings) {
				if (
					Object.prototype.hasOwnProperty.call(partialSettings, key)
				) {
					const element =
						partialSettings[key as keyof ConfluenceSettings];
					if (element) {
						settings = {
							...settings,
							[key as keyof ConfluenceSettings]: element,
						};
					}
				}
			}
		}

		return settings as ConfluenceSettings;
	}

	loadPartial(): Partial<ConfluenceSettings> {
		return this.combineSettings();
	}
}
