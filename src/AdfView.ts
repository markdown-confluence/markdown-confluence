import {
	EventRef,
	ItemView,
	Menu,
	Vault,
	Workspace,
	WorkspaceLeaf,
} from "obsidian";
import { MyPluginSettings } from "./Settings";
import React from "react";
import ReactDOM from "react-dom";
import { ReactRenderer } from "@atlaskit/renderer";
import MdToADF from "./mdToADF";

export const ADF_VIEW_TYPE = "AtlassianDocumentFormatView";

export default class AdfView extends ItemView {
	displayText: string;
	settings: MyPluginSettings;
	filePath: string;
	fileName: string;
	vault: Vault;
	workspace: Workspace;
	mdToADF: MdToADF;

	getViewType(): string {
		return ADF_VIEW_TYPE;
	}
	getDisplayText(): string {
		return this.displayText ?? "ADF Preview";
	}

	getIcon() {
		return "dot-network";
	}

	constructor(
		settings: MyPluginSettings,
		leaf: WorkspaceLeaf,
		initialFileInfo: { path: string; basename: string }
	) {
		super(leaf);
		this.settings = settings;
		this.filePath = initialFileInfo.path;
		this.fileName = initialFileInfo.basename;
		this.vault = this.app.vault;
		this.workspace = this.app.workspace;
		this.mdToADF = new MdToADF();
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		// TODO: SET BACKGROUND TO LIGHT
		container.style.backgroundColor = "#FFFFFF";

		let md = await this.app.vault.adapter.read(this.filePath);
		const adf = this.mdToADF.parse(md);
		ReactDOM.render(
			React.createElement(ReactRenderer, { document: adf }),
			container
		);
	}

	async onClose() {
		// Nothing to clean up.
	}
}
