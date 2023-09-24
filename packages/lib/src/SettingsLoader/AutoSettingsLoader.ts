import { ConfluenceSettings, DEFAULT_SETTINGS } from "../Settings.js";
import { DefaultSettingsLoader } from "./DefaultSettingsLoader.js";
import { EnvironmentVariableSettingsLoader } from "./EnvironmentVariableSettingsLoader.js";
import { ConfigFileSettingsLoader } from "./ConfigFileSettingsLoader.js";
import { CommandLineArgumentSettingsLoader } from "./CommandLineArgumentSettingsLoader.js";
import { SettingsLoader } from "./SettingsLoader.js";

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
				const propertyKey = key as keyof ConfluenceSettings;
				if (
					Object.prototype.hasOwnProperty.call(
						partialSettings,
						propertyKey,
					)
				) {
					const element = partialSettings[propertyKey];
					if (
						element &&
						typeof element === typeof DEFAULT_SETTINGS[propertyKey]
					) {
						settings = {
							...settings,
							[propertyKey]: element,
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
