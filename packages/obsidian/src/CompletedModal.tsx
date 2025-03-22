import { UploadAdfFileResult } from "@markdown-confluence/lib";
import { App, ButtonComponent, Modal, setIcon } from "obsidian";
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

		// Add CSS class for styling
		contentEl.addClass("completed-modal");

		// Set title
		titleEl.setText("Confluence Publish Results");

		// Add success indicator when no errors
		if (
			!this.uploadResults.errorMessage &&
			this.uploadResults.failedFiles.length === 0
		) {
			const successBanner = contentEl.createDiv({
				cls: "success-banner",
			});
			successBanner.createSpan({
				cls: "success-icon",
			});
			setIcon(successBanner.lastChild as HTMLElement, "check-circle");
			successBanner.createSpan({
				text: `Successfully published ${this.uploadResults.filesUploadResult.length} file(s)`,
			});
		}

		// Handle error message if present
		if (this.uploadResults.errorMessage) {
			const errorBanner = contentEl.createDiv({
				cls: "error-banner",
			});
			errorBanner.createSpan({
				cls: "error-icon",
			});
			setIcon(errorBanner.lastChild as HTMLElement, "alert-triangle");
			errorBanner.createSpan({
				text: "Error",
			});

			contentEl.createEl("p", {
				text: this.uploadResults.errorMessage,
				cls: "error-message",
			});
			return;
		}

		/* // Display successful uploads
		contentEl.createEl("h3", { text: "Summary" });
		contentEl.createEl("p", {
			text: `${this.uploadResults.filesUploadResult.length} file(s) uploaded successfully.`,
		}); */

		// Display failed uploads if any
		if (this.uploadResults.failedFiles.length > 0) {
			const failedSection = contentEl.createDiv({
				cls: "failed-uploads",
			});

			const failedHeader = failedSection.createDiv({
				cls: "failed-header",
			});
			failedHeader.createSpan({
				cls: "failed-icon",
			});
			setIcon(failedHeader.lastChild as HTMLElement, "alert-triangle");
			failedHeader.createEl("h3", {
				text: "Failed Uploads",
			});

			failedSection.createEl("p", {
				text: `${this.uploadResults.failedFiles.length} file(s) failed to upload.`,
			});

			const failedList = failedSection.createEl("ul", {
				cls: "failed-list",
			});
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
		// Filter results by actual changes for accurate counts
		const countResults = {
			content: { same: 0, updated: 0 },
			images: { same: 0, updated: 0 },
			labels: { same: 0, updated: 0 },
		};

		// Check if there are any images or labels at all
		const hasAnyImages = this.uploadResults.filesUploadResult.some(
			(result) =>
				result.adfFile.images && result.adfFile.images.length > 0,
		);

		const hasAnyLabels = this.uploadResults.filesUploadResult.some(
			(result) =>
				result.adfFile.labels && result.adfFile.labels.length > 0,
		);

		// Count only real updates
		this.uploadResults.filesUploadResult.forEach((result) => {
			// For content, always trust the contentResult directly
			countResults.content[result.contentResult]++;

			// For images, only count if the file actually has images
			if (result.adfFile.images && result.adfFile.images.length > 0) {
				countResults.images[result.imageResult]++;
			}

			// For labels, only count if the file actually has labels
			if (result.adfFile.labels && result.adfFile.labels.length > 0) {
				countResults.labels[result.labelResult]++;
			}
		});

		const tableContainer = contentEl.createDiv({
			cls: "table-container",
		});
		tableContainer.createEl("h3", { text: "Update Details" });

		const table = tableContainer.createEl("table", { cls: "result-table" });
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
			cls: "same-count",
		});
		contentRow.createEl("td", {
			text: countResults.content.updated.toString(),
			cls: "updated-count",
		});

		// Only display images row if there are any images
		if (hasAnyImages) {
			const imagesRow = tbody.createEl("tr");
			imagesRow.createEl("td", { text: "Images" });
			imagesRow.createEl("td", {
				text: countResults.images.same.toString(),
				cls: "same-count",
			});
			imagesRow.createEl("td", {
				text: countResults.images.updated.toString(),
				cls: "updated-count",
			});
		}

		// Only display labels row if there are any labels
		if (hasAnyLabels) {
			const labelsRow = tbody.createEl("tr");
			labelsRow.createEl("td", { text: "Labels" });
			labelsRow.createEl("td", {
				text: countResults.labels.same.toString(),
				cls: "same-count",
			});
			labelsRow.createEl("td", {
				text: countResults.labels.updated.toString(),
				cls: "updated-count",
			});
		}
	}

	private createExpandableSection(contentEl: HTMLElement) {
		// Count total updates based on filtered results
		const hasContentUpdates = this.uploadResults.filesUploadResult.some(
			(result) => result.contentResult === "updated",
		);

		const hasImageUpdates = this.uploadResults.filesUploadResult.some(
			(result) =>
				result.imageResult === "updated" &&
				result.adfFile.images &&
				result.adfFile.images.length > 0,
		);

		const hasLabelUpdates = this.uploadResults.filesUploadResult.some(
			(result) =>
				result.labelResult === "updated" &&
				result.adfFile.labels &&
				result.adfFile.labels.length > 0,
		);

		const totalUpdates =
			(hasContentUpdates ? 1 : 0) +
			(hasImageUpdates ? 1 : 0) +
			(hasLabelUpdates ? 1 : 0);

		// Only show expandable section if there are updates
		if (totalUpdates === 0) {
			return;
		}

		const expandableSection = contentEl.createDiv({
			cls: "expandable-section",
		});
		expandableSection.createEl("h3", { text: "Updated Files" });

		// Create container for button
		const buttonContainer = expandableSection.createDiv({
			cls: "button-container",
		});

		// Create content container for updated files
		const updatedFilesSection = expandableSection.createDiv({
			cls: "updated-files",
		});
		updatedFilesSection.style.display = "none";

		// Create toggle button using ButtonComponent
		const toggleButton = new ButtonComponent(buttonContainer);
		toggleButton
			.setButtonText(this.expanded ? "Hide Details" : "Show Details")
			.setCta()
			.onClick(() => {
				this.expanded = !this.expanded;
				toggleButton.setButtonText(
					this.expanded ? "Hide Details" : "Show Details",
				);
				updatedFilesSection.style.display = this.expanded
					? "block"
					: "none";

				// Set button styling based on state
				if (this.expanded) {
					toggleButton.removeCta();
				} else {
					toggleButton.setCta();
				}
			});

		// Content updates - only show if there are actual content updates
		if (hasContentUpdates) {
			this.createUpdatedFilesList(
				updatedFilesSection,
				"content",
				"Content",
			);
		}

		// Image updates - only show if there are actual image updates
		if (hasImageUpdates) {
			this.createUpdatedImagesList(updatedFilesSection);
		}

		// Label updates - only show if there are actual label updates
		if (hasLabelUpdates) {
			this.createUpdatedLabelsList(updatedFilesSection);
		}
	}

	// For content files
	private createUpdatedFilesList(
		container: HTMLElement,
		type: "content" | "image" | "label",
		title: string,
	) {
		const updatedFiles = this.uploadResults.filesUploadResult.filter(
			(result) => result.contentResult === "updated",
		);

		// Only create section if there are updated files
		if (updatedFiles.length === 0) {
			return;
		}

		const section = container.createDiv({ cls: `updated-${type}` });

		// Create header with icon
		const sectionHeader = section.createDiv({
			cls: "section-header",
		});
		sectionHeader.createSpan({
			cls: "section-icon",
		});
		setIcon(sectionHeader.lastChild as HTMLElement, "file-text");
		sectionHeader.createEl("h4", {
			text: `Updated ${title} (${updatedFiles.length})`,
		});

		const list = section.createEl("ul");
		updatedFiles.forEach((result) => {
			const item = list.createEl("li");

			// Create file path display with icon
			const filePath = item.createDiv({ cls: "file-path" });
			setIcon(filePath.createSpan(), "file-text");

			// Extract and show just the filename
			const pathParts = result.adfFile.absoluteFilePath.split("/");
			const fileName = pathParts[pathParts.length - 1];
			filePath.createSpan({ text: fileName });

			// Add a separate link to view in Confluence
			const linkDiv = item.createDiv({ cls: "file-link" });
			const link = linkDiv.createEl("a");
			link.href = result.adfFile.pageUrl;
			link.setText("View in Confluence");
			setIcon(link, "external-link", { after: true });
			link.addEventListener("click", (e) => {
				e.preventDefault();
				window.open(result.adfFile.pageUrl, "_blank");
			});
		});
	}

	// Specific method for updated images
	private createUpdatedImagesList(container: HTMLElement) {
		// Find files that have updated images
		const filesWithUpdatedImages =
			this.uploadResults.filesUploadResult.filter(
				(result) =>
					result.imageResult === "updated" &&
					result.adfFile.images &&
					result.adfFile.images.length > 0,
			);

		if (filesWithUpdatedImages.length === 0) {
			return;
		}

		const section = container.createDiv({ cls: "updated-image" });

		// Create header with icon
		const sectionHeader = section.createDiv({
			cls: "section-header",
		});
		sectionHeader.createSpan({
			cls: "section-icon",
		});
		setIcon(sectionHeader.lastChild as HTMLElement, "image");

		// Count total images updated
		let totalImagesUpdated = 0;
		filesWithUpdatedImages.forEach((file) => {
			totalImagesUpdated += file.adfFile.images?.length || 0;
		});

		sectionHeader.createEl("h4", {
			text: `Updated Images (${totalImagesUpdated})`,
		});

		const list = section.createEl("ul");
		filesWithUpdatedImages.forEach((result) => {
			// For each file that has updated images, list the images
			(result.adfFile.images || []).forEach((image) => {
				const item = list.createEl("li");

				// Create image path display with icon
				const imagePath = item.createDiv({ cls: "file-path" });
				setIcon(imagePath.createSpan(), "image");

				// Show the image name
				imagePath.createSpan({ text: image.fileName });

				// Add a separate link to view parent page in Confluence
				const linkDiv = item.createDiv({ cls: "file-link" });
				const link = linkDiv.createEl("a");
				link.href = result.adfFile.pageUrl;
				link.setText("View in Confluence");
				setIcon(link, "external-link", { after: true });
				link.addEventListener("click", (e) => {
					e.preventDefault();
					window.open(result.adfFile.pageUrl, "_blank");
				});
			});
		});
	}

	// Specific method for updated labels
	private createUpdatedLabelsList(container: HTMLElement) {
		// Find files that have updated labels
		const filesWithUpdatedLabels =
			this.uploadResults.filesUploadResult.filter(
				(result) =>
					result.labelResult === "updated" &&
					result.adfFile.labels &&
					result.adfFile.labels.length > 0,
			);

		if (filesWithUpdatedLabels.length === 0) {
			return;
		}

		const section = container.createDiv({ cls: "updated-label" });

		// Create header with icon
		const sectionHeader = section.createDiv({
			cls: "section-header",
		});
		sectionHeader.createSpan({
			cls: "section-icon",
		});
		setIcon(sectionHeader.lastChild as HTMLElement, "tag");

		// Count total labels updated
		let totalLabelsUpdated = 0;
		filesWithUpdatedLabels.forEach((file) => {
			totalLabelsUpdated += file.adfFile.labels?.length || 0;
		});

		sectionHeader.createEl("h4", {
			text: `Updated Labels (${totalLabelsUpdated})`,
		});

		const list = section.createEl("ul");
		filesWithUpdatedLabels.forEach((result) => {
			// For each file that has updated labels, list the labels
			(result.adfFile.labels || []).forEach((label) => {
				const item = list.createEl("li");

				// Create label display with icon
				const labelEl = item.createDiv({ cls: "file-path" });
				setIcon(labelEl.createSpan(), "tag");

				// Show the label name
				labelEl.createSpan({ text: label });

				// Add info about which file this label belongs to
				labelEl.createSpan({
					text: ` (in ${result.adfFile.absoluteFilePath
						.split("/")
						.pop()})`,
					cls: "label-file-info",
				});

				// Add a separate link to view parent page in Confluence
				const linkDiv = item.createDiv({ cls: "file-link" });
				const link = linkDiv.createEl("a");
				link.href = result.adfFile.pageUrl;
				link.setText("View in Confluence");
				setIcon(link, "external-link", { after: true });
				link.addEventListener("click", (e) => {
					e.preventDefault();
					window.open(result.adfFile.pageUrl, "_blank");
				});
			});
		});
	}

	override onClose() {
		this.logger.debug("Closing completed modal");
		const { contentEl } = this;
		contentEl.empty();
	}
}
