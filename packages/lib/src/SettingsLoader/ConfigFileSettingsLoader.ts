import path from "path";
import { ConfluenceSettings, DEFAULT_SETTINGS } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";
import fs from "fs";
import yargs from "yargs";

export class ConfigFileSettingsLoader extends SettingsLoader {
	private configPath: string = path.join(
		process.cwd() ?? "",
		".markdown-confluence.json",
	);

	constructor(configPath?: string) {
		super();

		if (configPath) {
			this.configPath = configPath;
			return;
		}

		if (
			"CONFLUENCE_CONFIG_FILE" in process.env &&
			process.env["CONFLUENCE_CONFIG_FILE"]
		) {
			this.configPath = process.env["CONFLUENCE_CONFIG_FILE"];
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
					const propertyKey = key as keyof ConfluenceSettings;
					const element = config[propertyKey];
					if (element) {
						result[propertyKey] = element;
					}
				}
			}

			return result;
		} catch {
			return {};
		}
	}
}
