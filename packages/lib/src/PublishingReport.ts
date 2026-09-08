import type { MarkdownFile } from "./MarkdownWorkspace";
import type { ConfluenceSettings } from "./Settings";
import type { FilePublishResult, LocalAdfFileTreeNode } from "./Publisher";
import type { RequiredConfluenceClient } from "./ConfluenceClient";
import { createFolderStructure } from "./TreeLocal";
import { convertMDtoADF } from "./MdToADF";

export interface ValidationReport {
	schemaVersion: 1;
	valid: boolean;
	files: { source: string; title?: string; errors: string[] }[];
	errors: string[];
}

export function validatePublishingFiles(
	files: MarkdownFile[],
	settings: ConfluenceSettings,
): ValidationReport {
	const report: ValidationReport = { schemaVersion: 1, valid: true, files: [], errors: [] };
	for (const file of files) {
		try {
			const converted = convertMDtoADF(structuredClone(file), settings);
			report.files.push({
				source: file.absoluteFilePath,
				title: converted.pageTitle,
				errors: converted.pageTitle.trim() ? [] : ["Page title is empty"],
			});
		} catch (error) {
			report.files.push({ source: file.absoluteFilePath, errors: [message(error)] });
		}
	}
	if (!files.length) report.errors.push("No files selected for publishing");
	else if (report.files.every((file) => !file.errors.length)) {
		try {
			createFolderStructure(structuredClone(files), settings);
		} catch (error) {
			report.errors.push(message(error));
		}
	}
	report.valid = !report.errors.length && report.files.every((file) => !file.errors.length);
	return report;
}

/** Read-only discovery. Never calls the publisher, attachment renderer or frontmatter writer.
 * Existing pages require reconciliation at publish time; this is not a claim of exact no-op detection.
 */
export async function planPublishingFiles(
	files: MarkdownFile[],
	settings: ConfluenceSettings,
	client: Pick<RequiredConfluenceClient, "content">,
) {
	const validation = validatePublishingFiles(files, settings);
	const pages: {
		source: string;
		title: string;
		action: "create" | "reconcile" | "blocked";
		pageId?: string;
		reason?: string;
	}[] = [];
	if (!validation.valid) return { schemaVersion: 1, validation, pages };
	const parent = await client.content.getContentById({
		id: settings.confluenceParentId,
		expand: ["space"],
	});
	if (!parent.space?.key) throw new Error("Publish parent has no space key");
	const visit = async (node: LocalAdfFileTreeNode, root = false) => {
		if (node.file && !root) {
			const file = node.file;
			try {
				const candidates = file.pageId
					? [
							await client.content.getContentById({
								id: file.pageId,
								expand: ["ancestors", "space"],
							}),
						]
					: (
							await client.content.getContent({
								title: file.pageTitle,
								spaceKey: parent.space!.key,
								type: file.contentType,
								expand: ["ancestors", "space"],
							})
						).results;
				const existing = candidates[0];
				if (candidates.length > 1)
					throw new Error(
						"Ambiguous page title; assign a connie-page-id before publishing",
					);
				if (
					existing &&
					!file.pageId &&
					file.contentType === "page" &&
					!existing.ancestors?.some((ancestor) => ancestor.id === parent.id)
				)
					throw new Error("Matching page is outside the selected page tree");
				pages.push({
					source: file.absoluteFilePath,
					title: file.pageTitle,
					action: existing ? "reconcile" : "create",
					...(existing
						? {
								pageId: existing.id,
								reason: "Publishing will compare rendered content, attachments, labels and permissions",
							}
						: {}),
				});
			} catch (error) {
				pages.push({
					source: file.absoluteFilePath,
					title: file.pageTitle,
					action: "blocked",
					reason: message(error),
				});
			}
		}
		for (const child of node.children) await visit(child);
	};
	await visit(createFolderStructure(structuredClone(files), settings), true);
	return { schemaVersion: 1, validation, pages };
}

export function publishingReport(results: FilePublishResult[]) {
	return {
		schemaVersion: 1,
		pages: results.map((result) => ({
			source: result.node.file.absoluteFilePath,
			pageId: result.node.file.pageId,
			url: result.node.file.pageUrl,
			status: result.successfulUploadResult ? "published" : "failed",
			...(result.successfulUploadResult
				? {
						content: result.successfulUploadResult.contentResult,
						attachments: result.successfulUploadResult.imageResult,
						labels: result.successfulUploadResult.labelResult,
					}
				: { error: result.reason ?? "Unknown publishing error" }),
		})),
	};
}
function message(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
