import { ConfluenceSettings, DEFAULT_SETTINGS } from "../Settings.js";
import { SettingsLoader } from "./SettingsLoader.js";

export class DefaultSettingsLoader extends SettingsLoader {
	loadPartial(): Partial<ConfluenceSettings> {
		return DEFAULT_SETTINGS;
	}
}
