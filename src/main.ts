import { Plugin } from "obsidian";
import { MainSettingTab } from "./MainSettingTab";
import { DEFAULT_SETTINGS, MyPluginSettings } from "./Settings";
import { Publisher } from "./Publisher";
import ObsidianAdaptor from "./adaptors/obsidian";
import { CompletedModal } from "./CompletedModal";

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "publish-to-confluence",
			name: "Publish to Confluence",
			callback: async () => {
				const { vault, metadataCache } = this.app;
				const publisher = new Publisher(
					new ObsidianAdaptor(vault, metadataCache, this.settings),
					this.settings
				);
				const stats = await publisher.doPublish();
				new CompletedModal(this.app, stats).open();
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
