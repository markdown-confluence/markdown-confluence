import { ConfluenceSettings } from "../Settings.js";
import { SettingsLoader } from "./SettingsLoader.js";

export class StaticSettingsLoader extends SettingsLoader {
	constructor(private settings: Partial<ConfluenceSettings>) {
		super();
	}

	loadPartial(): Partial<ConfluenceSettings> {
		return this.settings;
	}
}
