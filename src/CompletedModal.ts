import { Modal, App } from "obsidian";

export class CompletedModal extends Modal {
	uploadStatuses: { successes: number; failures: number };

	constructor(
		app: App,
		uploadStatuses: { successes: number; failures: number }
	) {
		super(app);
		this.uploadStatuses = uploadStatuses;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText(JSON.stringify(this.uploadStatuses));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
