import { UploadAdfFileResult } from "@markdown-confluence/lib";
import { App, Modal, Setting } from "obsidian";
import { Logger, LogLevel } from "./utils";

export interface FailedFile {
	fileName: string;
	reason: string;
}

export interface UploadResults {
	errorMessage: string | null;
	failedFiles: FailedFile[];
	filesUploadResult: UploadAdfFileResult[];
}

export class CompletedModal extends Modal {
	private uploadResults: UploadResults;
	private logger: Logger;
	private expanded: boolean = false;

	constructor(app: App, uploadResults: UploadResults) {
		super(app);
		this.uploadResults = uploadResults;
		this.logger = Logger.createDefault();
		this.logger.updateOptions({
			prefix: "CompletedModal",
			minLevel: LogLevel.SILENT, // Default to silent, will be updated by plugin if available
		});
		this.logger.debug("CompletedModal initialized", {
			failedFiles: uploadResults.failedFiles.length,
			filesUploaded: uploadResults.filesUploadResult.length,
		});
	}

	override onOpen() {
		this.logger.debug("Opening completed modal");
		const { contentEl, titleEl } = this;

		// Set title
		titleEl.setText("Confluence Publish");

		// Handle error message if present
		if (this.uploadResults.errorMessage) {
			contentEl.createEl("h3", { text: "Error" });
			contentEl.createEl("p", { text: this.uploadResults.errorMessage });
			return;
		}

		// Display successful uploads
		contentEl.createEl("h3", { text: "Successful Uploads" });
		contentEl.createEl("p", {
			text: `${this.uploadResults.filesUploadResult.length} file(s) uploaded successfully.`,
		});

		// Display failed uploads if any
		if (this.uploadResults.failedFiles.length > 0) {
			const failedSection = contentEl.createDiv({
				cls: "failed-uploads",
			});
			failedSection.createEl("h3", { text: "Failed Uploads" });
			failedSection.createEl("p", {
				text: `${this.uploadResults.failedFiles.length} file(s) failed to upload.`,
			});

			const failedList = failedSection.createEl("ul");
			this.uploadResults.failedFiles.forEach((file) => {
				const item = failedList.createEl("li");
				const strong = item.createEl("strong");
				strong.setText(file.fileName);
				item.appendText(": " + file.reason);
			});
		}

		// Create results table with counts
		this.createResultsTable(contentEl);

		// Create expandable section for updated files
		this.createExpandableSection(contentEl);
	}

	private createResultsTable(contentEl: HTMLElement) {
		const countResults = {
			content: { same: 0, updated: 0 },
			images: { same: 0, updated: 0 },
			labels: { same: 0, updated: 0 },
		};

		this.uploadResults.filesUploadResult.forEach((result) => {
			countResults.content[result.contentResult]++;
			countResults.images[result.imageResult]++;
			countResults.labels[result.labelResult]++;
		});

		const table = contentEl.createEl("table", { cls: "result-table" });
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		headerRow.createEl("th", { text: "Type" });
		headerRow.createEl("th", { text: "Same" });
		headerRow.createEl("th", { text: "Updated" });

		const tbody = table.createEl("tbody");

		// Content row
		const contentRow = tbody.createEl("tr");
		contentRow.createEl("td", { text: "Content" });
		contentRow.createEl("td", {
			text: countResults.content.same.toString(),
		});
		contentRow.createEl("td", {
			text: countResults.content.updated.toString(),
		});

		// Images row
		const imagesRow = tbody.createEl("tr");
		imagesRow.createEl("td", { text: "Images" });
		imagesRow.createEl("td", { text: countResults.images.same.toString() });
		imagesRow.createEl("td", {
			text: countResults.images.updated.toString(),
		});

		// Labels row
		const labelsRow = tbody.createEl("tr");
		labelsRow.createEl("td", { text: "Labels" });
		labelsRow.createEl("td", { text: countResults.labels.same.toString() });
		labelsRow.createEl("td", {
			text: countResults.labels.updated.toString(),
		});
	}

	private createExpandableSection(contentEl: HTMLElement) {
		const expandableSection = contentEl.createDiv({
			cls: "expandable-section",
		});

		new Setting(expandableSection).addButton((button) => {
			button.setButtonText("Expand Updated Files");
			button.onClick(() => {
				this.expanded = !this.expanded;
				button.setButtonText(
					this.expanded
						? "Collapse Updated Files"
						: "Expand Updated Files",
				);
				updatedFilesSection.style.display = this.expanded
					? "block"
					: "none";
			});
		});

		const updatedFilesSection = expandableSection.createDiv({
			cls: "updated-files",
		});
		updatedFilesSection.style.display = "none";

		// Content updates
		this.createUpdatedFilesList(
			updatedFilesSection,
			"content",
			"Updated Content",
		);

		// Image updates
		this.createUpdatedFilesList(
			updatedFilesSection,
			"image",
			"Updated Images",
		);

		// Label updates
		this.createUpdatedFilesList(
			updatedFilesSection,
			"label",
			"Updated Labels",
		);
	}

	private createUpdatedFilesList(
		container: HTMLElement,
		type: "content" | "image" | "label",
		title: string,
	) {
		const section = container.createDiv({ cls: `updated-${type}` });
		section.createEl("h4", { text: title });

		const updatedFiles = this.uploadResults.filesUploadResult.filter(
			(result) => {
				const key = `${type}Result` as keyof UploadAdfFileResult;
				return result[key] === "updated";
			},
		);

		if (updatedFiles.length === 0) {
			section.createEl("p", { text: "No updates" });
			return;
		}

		const list = section.createEl("ul");
		updatedFiles.forEach((result) => {
			const item = list.createEl("li");
			const link = item.createEl("a");
			link.href = result.adfFile.pageUrl;
			link.setText(result.adfFile.absoluteFilePath);
			link.addEventListener("click", (e) => {
				e.preventDefault();
				window.open(result.adfFile.pageUrl, "_blank");
			});
		});
	}

	override onClose() {
		this.logger.debug("Closing completed modal");
		const { contentEl } = this;
		contentEl.empty();
	}
}
