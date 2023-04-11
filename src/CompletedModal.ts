import { Modal, App } from "obsidian";
import CompletedView, { UploadResultsProps } from "./CompletedView";
import ReactDOM from "react-dom";
import React from "react";

export class CompletedModal extends Modal {
	uploadResults: UploadResultsProps;

	constructor(app: App, uploadResults: UploadResultsProps) {
		super(app);
		this.uploadResults = uploadResults;
	}

	onOpen() {
		const { contentEl } = this;
		ReactDOM.render(
			React.createElement(CompletedView, this.uploadResults),
			contentEl
		);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
