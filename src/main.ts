import { Plugin } from "obsidian";
import { MainSettingTab } from "./MainSettingTab";
import { DEFAULT_SETTINGS, MyPluginSettings } from "./Settings";
import { Publisher } from "./Publisher";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "publish-to-confluence",
			name: "Publish to Confluence",
			callback: async () => {
				const { vault, workspace, metadataCache } = this.app;
				const publisher = new Publisher(
					vault,
					metadataCache,
					this.settings
				);
				await publisher.doPublish();
			},
		});

		this.addSettingTab(new MainSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
