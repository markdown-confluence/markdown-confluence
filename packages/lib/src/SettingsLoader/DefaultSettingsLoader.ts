import { ConfluenceSettings, DEFAULT_SETTINGS } from "src/Settings";
import { SettingsLoader } from ".";

export class DefaultSettingsLoader extends SettingsLoader {
	loadPartial(): Partial<ConfluenceSettings> {
		return DEFAULT_SETTINGS;
	}
}
