import { ConfluenceSettings, DEFAULT_SETTINGS } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";

export class DefaultSettingsLoader extends SettingsLoader {
	loadPartial(): Partial<ConfluenceSettings> {
		return DEFAULT_SETTINGS;
	}
}
