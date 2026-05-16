import { doc, p } from "@atlaskit/adf-utils/builders";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { Effect } from "effect";
import { prepareAdfToUpload } from "./AdfProcessing";
import { createMissingSpaceKeyError } from "./ConfluenceErrors";
import { MarkdownConfluencePlatform, runEffect } from "./effects";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { MarkdownWorkspace, MarkdownWorkspaceService } from "./MarkdownWorkspace";
import {
	ConfluenceAdfFile,
	ConfluenceNode,
	ConfluenceTreeNode,
	LocalAdfFile,
	LocalAdfFileTreeNode,
} from "./Publisher";
import { ConfluenceSettings } from "./Settings";

const blankPageAdf: string = JSON.stringify(doc(p("Page not published yet")));

interface PageDetails {
	id: string;
	title: string;
	version: number;
	lastUpdatedBy: string;
	existingAdf: string | undefined;
	spaceKey: string;
	pageTitle: string;
	ancestors: { id: string }[];
	contentType: string;
}

function flattenTree(node: ConfluenceTreeNode, ancestors: string[] = []): ConfluenceNode[] {
	const nodes: ConfluenceNode[] = [];
	const { file, version, lastUpdatedBy, existingPageData, children } = node;

	if (ancestors.length > 0) {
		nodes.push({
			file,
			version,
			lastUpdatedBy,
			existingPageData,
			ancestors,
		});
	}

	if (children) {
		children.forEach((child) => {
			nodes.push(...flattenTree(child, [...ancestors, file.pageId]));
		});
	}

	return nodes;
}

export function ensureAllFilesExistInConfluenceEffect(
	confluenceClient: RequiredConfluenceClient,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string,
	topPageId: string,
	settings: ConfluenceSettings,
): Effect.Effect<ConfluenceNode[], unknown, MarkdownConfluencePlatform | MarkdownWorkspaceService> {
	return Effect.gen(function* () {
		const confluenceNode = yield* createFileStructureInConfluenceEffect(
			settings,
			confluenceClient,
			node,
			spaceKey,
			parentPageId,
			topPageId,
			false,
		);

		const pages = flattenTree(confluenceNode);

		yield* Effect.sync(() => prepareAdfToUpload(pages, settings));

		return pages;
	});
}

export function ensureAllFilesExistInConfluence(
	confluenceClient: RequiredConfluenceClient,
	workspace: MarkdownWorkspace,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string,
	topPageId: string,
	settings: ConfluenceSettings,
): Promise<ConfluenceNode[]> {
	return runEffect(
		ensureAllFilesExistInConfluenceEffect(
			confluenceClient,
			node,
			spaceKey,
			parentPageId,
			topPageId,
			settings,
		).pipe(Effect.provideService(MarkdownWorkspaceService, workspace)),
	);
}

function createFileStructureInConfluenceEffect(
	settings: ConfluenceSettings,
	confluenceClient: RequiredConfluenceClient,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string,
	topPageId: string,
	createPage: boolean,
): Effect.Effect<
	ConfluenceTreeNode,
	unknown,
	MarkdownConfluencePlatform | MarkdownWorkspaceService
> {
	return Effect.gen(function* () {
		if (!node.file) {
			return yield* Effect.fail(new Error("Missing file on node"));
		}

		let version: number;
		let adfContent: JSONDocNode | undefined;
		let pageTitle = "";
		let contentType = "page";
		let ancestors: { id: string }[] = [];
		let lastUpdatedBy: string | undefined;
		const file: ConfluenceAdfFile = {
			...node.file,
			pageId: parentPageId,
			spaceKey,
			pageUrl: "",
		};

		if (createPage) {
			const pageDetails = yield* ensurePageExistsEffect(
				confluenceClient,
				node.file,
				settings,
				spaceKey,
				parentPageId,
				topPageId,
			);
			file.pageId = pageDetails.id;
			file.spaceKey = pageDetails.spaceKey;
			version = pageDetails.version;
			adfContent = yield* Effect.try({
				try: () => JSON.parse(pageDetails.existingAdf ?? "{}") as JSONDocNode,
				catch: toError,
			});
			pageTitle = pageDetails.pageTitle;
			ancestors = pageDetails.ancestors;
			lastUpdatedBy = pageDetails.lastUpdatedBy;
			contentType = pageDetails.contentType;
		} else {
			if (isMarkdownBackedFile(node.file)) {
				yield* updateMarkdownValuesEffect(node.file.absoluteFilePath, {
					publish: true,
					pageId: parentPageId,
				});
			}

			version = 0;
			adfContent = doc(p());
			pageTitle = "";
			ancestors = [];
			contentType = "page";
		}

		const childDetails: ConfluenceTreeNode[] = yield* Effect.all(
			node.children.map((childNode) =>
				createFileStructureInConfluenceEffect(
					settings,
					confluenceClient,
					childNode,
					spaceKey,
					file.pageId,
					topPageId,
					true,
				),
			),
			{ concurrency: "unbounded" },
		);

		const pageUrl = `${settings.confluenceBaseUrl}/wiki/spaces/${spaceKey}/pages/${file.pageId}/`;
		return {
			file: { ...file, pageUrl },
			version,
			lastUpdatedBy: lastUpdatedBy ?? "",
			children: childDetails,
			existingPageData: {
				adfContent,
				pageTitle,
				ancestors,
				contentType,
			},
		};
	});
}

function isMarkdownBackedFile(file: LocalAdfFile): boolean {
	return file.absoluteFilePath.toLowerCase().endsWith(".md");
}

function ensurePageExistsEffect(
	confluenceClient: RequiredConfluenceClient,
	file: LocalAdfFile,
	settings: ConfluenceSettings,
	spaceKey: string,
	parentPageId: string,
	topPageId: string,
): Effect.Effect<PageDetails, unknown, MarkdownConfluencePlatform | MarkdownWorkspaceService> {
	if (file.pageId) {
		const pageId = file.pageId;

		return Effect.tryPromise({
			try: () =>
				confluenceClient.content.getContentById({
					id: pageId,
					expand: ["version", "body.atlas_doc_format", "ancestors", "space"],
				}),
			catch: identity,
		}).pipe(
			Effect.flatMap((contentById) => {
				if (!contentById.space?.key) {
					return Effect.fail(
						createMissingSpaceKeyError(pageId, settings.confluenceBaseUrl),
					);
				}

				return updateMarkdownValuesEffect(file.absoluteFilePath, {
					publish: true,
					pageId: contentById.id,
				}).pipe(
					Effect.as({
						id: contentById.id,
						title: file.pageTitle,
						version: contentById?.version?.number ?? 1,
						lastUpdatedBy: contentById?.version?.by?.accountId ?? "NO ACCOUNT ID",
						existingAdf: contentById?.body?.atlas_doc_format?.value,
						spaceKey: contentById.space.key,
						pageTitle: contentById.title,
						ancestors:
							contentById.ancestors?.map((ancestor) => ({
								id: ancestor.id,
							})) ?? [],
						contentType: contentById.type,
					}),
				);
			}),
			Effect.catch((error) => {
				if (isNotFoundError(error)) {
					return updateMarkdownValuesEffect(file.absoluteFilePath, {
						publish: false,
						pageId: undefined,
					}).pipe(
						Effect.andThen(
							findOrCreatePageByTitleEffect(
								confluenceClient,
								file,
								spaceKey,
								parentPageId,
								topPageId,
							),
						),
					);
				}

				return Effect.fail(error);
			}),
		);
	}

	return findOrCreatePageByTitleEffect(confluenceClient, file, spaceKey, parentPageId, topPageId);
}

function findOrCreatePageByTitleEffect(
	confluenceClient: RequiredConfluenceClient,
	file: LocalAdfFile,
	spaceKey: string,
	parentPageId: string,
	topPageId: string,
): Effect.Effect<PageDetails, unknown, MarkdownConfluencePlatform | MarkdownWorkspaceService> {
	const searchParams = {
		type: file.contentType,
		spaceKey,
		title: file.pageTitle,
		expand: ["version", "body.atlas_doc_format", "ancestors"],
	};

	return Effect.tryPromise({
		try: () => confluenceClient.content.getContent(searchParams),
		catch: identity,
	}).pipe(
		Effect.flatMap((contentByTitle) => {
			const currentPage = contentByTitle.results[0];

			if (currentPage) {
				if (
					file.contentType === "page" &&
					!currentPage.ancestors?.some((ancestor) => ancestor.id == topPageId)
				) {
					return Effect.fail(
						new Error(
							`${file.pageTitle} is trying to overwrite a page outside the page tree from the selected top page`,
						),
					);
				}

				return updateMarkdownValuesEffect(file.absoluteFilePath, {
					publish: true,
					pageId: currentPage.id,
				}).pipe(
					Effect.as({
						id: currentPage.id,
						title: file.pageTitle,
						version: currentPage.version?.number ?? 1,
						lastUpdatedBy: currentPage.version?.by?.accountId ?? "NO ACCOUNT ID",
						existingAdf: currentPage.body?.atlas_doc_format?.value,
						pageTitle: currentPage.title,
						spaceKey,
						ancestors:
							currentPage.ancestors?.map((ancestor) => ({
								id: ancestor.id,
							})) ?? [],
						contentType: currentPage.type,
					}),
				);
			}

			const creatingBlankPageRequest = {
				space: { key: spaceKey },
				...(file.contentType === "page" ? { ancestors: [{ id: parentPageId }] } : {}),
				title: file.pageTitle,
				type: file.contentType,
				body: {
					// eslint-disable-next-line @typescript-eslint/naming-convention
					atlas_doc_format: {
						value: blankPageAdf,
						representation: "atlas_doc_format",
					},
				},
				expand: ["version", "body.atlas_doc_format", "ancestors"],
			};

			return Effect.tryPromise({
				try: () => confluenceClient.content.createContent(creatingBlankPageRequest),
				catch: identity,
			}).pipe(
				Effect.flatMap((pageDetails) =>
					updateMarkdownValuesEffect(file.absoluteFilePath, {
						publish: true,
						pageId: pageDetails.id,
					}).pipe(
						Effect.as({
							id: pageDetails.id,
							title: file.pageTitle,
							version: pageDetails.version?.number ?? 1,
							lastUpdatedBy: pageDetails.version?.by?.accountId ?? "NO ACCOUNT ID",
							existingAdf: pageDetails.body?.atlas_doc_format?.value,
							pageTitle: pageDetails.title,
							ancestors:
								pageDetails.ancestors?.map((ancestor) => ({
									id: ancestor.id,
								})) ?? [],
							spaceKey,
							contentType: pageDetails.type,
						}),
					),
				),
			);
		}),
	);
}

function updateMarkdownValuesEffect(
	absoluteFilePath: string,
	values: Partial<ConfluencePerPageAllValues>,
): Effect.Effect<void, Error, MarkdownWorkspaceService> {
	return Effect.gen(function* () {
		const workspace = yield* MarkdownWorkspaceService;
		yield* workspace.updateMarkdownValues(absoluteFilePath, values);
	});
}

function isNotFoundError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"response" in error &&
		typeof error.response === "object" &&
		error.response !== null &&
		"status" in error.response &&
		typeof error.response.status === "number" &&
		error.response.status === 404
	);
}

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : JSON.stringify(error));
}

function identity(error: unknown): unknown {
	return error;
}
