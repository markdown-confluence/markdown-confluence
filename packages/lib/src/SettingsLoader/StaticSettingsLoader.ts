import { ConfluenceSettings } from "../Settings";
import { SettingsLoader } from "./SettingsLoader";

export class StaticSettingsLoader extends SettingsLoader {
	constructor(private settings: Partial<ConfluenceSettings>) {
		super();
	}

	loadPartial(): Partial<ConfluenceSettings> {
		return this.settings;
	}
}
