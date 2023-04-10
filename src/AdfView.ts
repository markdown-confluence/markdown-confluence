import {
	EventRef,
	FileSystemAdapter,
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
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { traverse, filter } from "@atlaskit/adf-utils/traverse";
import { IntlProvider } from "react-intl-next";

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
		const renderADF = this.convertMediaFilesToLocalPath(adf);

		const locale = "en";
		const messages = {
			// Your localized messages
		};

		const intlProvider = React.createElement(
			IntlProvider,
			{
				locale: locale,
				messages: messages,
			},
			// @ts-ignore
			React.createElement(ReactRenderer, { document: renderADF })
		);

		ReactDOM.render(intlProvider, container);
	}

	convertMediaFilesToLocalPath(adf: JSONDocNode): JSONDocNode {
		const basePath = this.getBasePath();
		return traverse(adf, {
			media: (node, parent) => {
				if (node?.attrs?.type === "file") {
					console.log({ node });
					const currentUrl = node?.attrs?.url as string;
					const test = this.app.vault.adapter as FileSystemAdapter;
					const vaultPath =
						this.app.metadataCache.getFirstLinkpathDest(
							currentUrl.replace("file://", ""),
							this.filePath
						);
					if (!vaultPath) {
						return false;
					}
					const path = test.getResourcePath(vaultPath.path);
					console.log({ path });
					node.attrs.type = "external";
					node.attrs.url = path; // currentUrl.replace("file://", `file://${basePath}`);
					return node;
				}
			},
		}) as JSONDocNode;
	}

	getBasePath() {
		let adapter = app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		throw new Error("No Path???");
	}

	async onClose() {
		// Nothing to clean up.
	}
}
