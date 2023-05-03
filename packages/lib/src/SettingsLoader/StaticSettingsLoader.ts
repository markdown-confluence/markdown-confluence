import { ConfluenceSettings } from "src/Settings";
import { SettingsLoader } from ".";

export class StaticSettingsLoader extends SettingsLoader {
	constructor(private settings: Partial<ConfluenceSettings>) {
		super();
	}

	loadPartial(): Partial<ConfluenceSettings> {
		return this.settings;
	}
}
