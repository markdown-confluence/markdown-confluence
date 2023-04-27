import fs from "fs";
import path from "path";
import yargs from "yargs";

export class ConfluenceSettings {
	confluenceBaseUrl: string;
	confluenceParentId: string;
	atlassianUserName: string;
	atlassianApiToken: string;
	folderToPublish: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention
	private _contentRoot: string;

	public get contentRoot(): string {
		return this._contentRoot;
	}
	public set contentRoot(path: string) {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}
		if (!fs.lstatSync(path).isDirectory()) {
			throw new Error(`'${path}' is not a directory.`);
		}
		if (!path.endsWith("/")) {
			path += "/";
		}
		this._contentRoot = path;
	}
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
		const settings = this.loadPartial();
		return this.validateSettings(settings);
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
		}

		return settings as ConfluenceSettings;
	}
}

export class DefaultSettingsLoader extends SettingsLoader {
	loadPartial(): Partial<ConfluenceSettings> {
		const result: Partial<ConfluenceSettings> = {};

		for (const key in DEFAULT_SETTINGS) {
			if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
				const element =
					DEFAULT_SETTINGS[key as keyof ConfluenceSettings];
				if (element && element !== "") {
					result[key as keyof ConfluenceSettings] = element;
				}
			}
		}

		return result;
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
		const initial = {
			confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL,
			confluenceParentId: process.env.CONFLUENCE_PARENT_ID,
			atlassianUserName: process.env.ATLASSIAN_USERNAME,
			atlassianApiToken: process.env.ATLASSIAN_API_TOKEN,
			folderToPublish: process.env.FOLDER_TO_PUBLISH,
			contentRoot: process.env.CONFLUENCE_CONTENT_ROOT,
		};

		const result: Partial<ConfluenceSettings> = {};
		for (const key in result) {
			if (Object.prototype.hasOwnProperty.call(result, key)) {
				const element = initial[key as keyof ConfluenceSettings];
				if (element) {
					result[key as keyof ConfluenceSettings] = element;
				}
			}
		}

		return result;
	}
}

export class ConfigFileSettingsLoader extends SettingsLoader {
	private configPath: string;

	constructor(configPath?: string) {
		super();

		if (!configPath) {
			const options = yargs(process.argv)
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
				.parseSync();

			this.configPath = options.config;
		} else {
			this.configPath = configPath;
		}
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
				default: process.cwd(),
			})
			.parseSync();

		return {
			confluenceBaseUrl: options.baseUrl,
			confluenceParentId: options.parentId,
			atlassianUserName: options.userName,
			atlassianApiToken: options.apiToken,
			folderToPublish: options.enableFolder,
		};
	}
}

export class AutoSettingsLoader extends SettingsLoader {
	constructor(private loaders: SettingsLoader[] = []) {
		super();

		if (loaders.length === 0) {
			this.loaders.push(new ConfigFileSettingsLoader());
			this.loaders.push(new EnvironmentVariableSettingsLoader());
			this.loaders.push(new CommandLineArgumentSettingsLoader());
			this.loaders.push(new DefaultSettingsLoader());
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

	load(): ConfluenceSettings {
		const settings = this.combineSettings();
		return this.validateSettings(settings);
	}
}
