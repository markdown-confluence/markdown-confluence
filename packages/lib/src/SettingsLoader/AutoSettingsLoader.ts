import { ConfluenceSettings, DEFAULT_SETTINGS } from "../Settings";
import { DefaultSettingsLoader } from "./DefaultSettingsLoader";
import { EnvironmentVariableSettingsLoader } from "./EnvironmentVariableSettingsLoader";
import { ConfigFileSettingsLoader } from "./ConfigFileSettingsLoader";
import { CommandLineArgumentSettingsLoader } from "./CommandLineArgumentSettingsLoader";
import { SettingsLoader } from "./SettingsLoader";

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
