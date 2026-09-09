import { doc, p } from "@atlaskit/adf-utils/builders";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { Effect } from "effect";
import { prepareAdfToUpload } from "./AdfProcessing";
import { createMissingSpaceKeyError } from "./ConfluenceErrors";
import { MarkdownConfluencePlatform, runEffect } from "./effects";
import { ConfluencePerPageAllValues } from "./ConniePageConfig";
import { ConfluenceContent, RequiredConfluenceClient } from "./ConfluenceClient";
import { MarkdownWorkspace, MarkdownWorkspaceService } from "./MarkdownWorkspace";
import {
	ConfluenceAdfFile,
	ConfluenceNode,
	ConfluenceTreeNode,
	LocalAdfFile,
	LocalAdfFileTreeNode,
} from "./Publisher";
import { ConfluenceSettings, resolveSiteUrl } from "./Settings";
import { assertUniquePageTargets, checkUniquePageIds } from "./TreeLocal";

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

function flattenTree(
	node: ConfluenceTreeNode,
	ancestors: string[] = [],
	includeCurrent = ancestors.length > 0,
	parentSpaceKey?: string,
): ConfluenceNode[] {
	const nodes: ConfluenceNode[] = [];
	const { file, version, lastUpdatedBy, existingPageData, children } = node;
	const crossesSpace = parentSpaceKey !== undefined && parentSpaceKey !== file.spaceKey;

	if (includeCurrent) {
		nodes.push({
			file,
			version,
			lastUpdatedBy,
			existingPageData,
			ancestors:
				ancestors.length > 0 && !crossesSpace
					? ancestors
					: existingPageData.ancestors.map((ancestor) => ancestor.id),
		});
	}

	if (children) {
		children.forEach((child) => {
			nodes.push(
				...flattenTree(
					child,
					crossesSpace ? [file.pageId] : [...ancestors, file.pageId],
					true,
					file.spaceKey,
				),
			);
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
		yield* Effect.try({ try: () => checkUniquePageIds(node), catch: toError });
		const resolvedPages = new Map<LocalAdfFile, PageDetails | undefined>();
		// Resolve every existing target before creating pages or changing source metadata.
		// Checking only the final publish queue is too late: hierarchy creation writes too.
		yield* resolveFileStructureEffect(
			confluenceClient,
			node,
			spaceKey,
			parentPageId,
			topPageId,
			settings,
			resolvedPages,
			true,
		);
		yield* Effect.try({
			try: () =>
				assertUniquePageTargets(
					Array.from(resolvedPages, ([file, page]) => ({
						absoluteFilePath: file.absoluteFilePath,
						pageId: page?.id,
					})),
				),
			catch: toError,
		});
		const confluenceNode = yield* createFileStructureInConfluenceEffect(
			settings,
			confluenceClient,
			node,
			spaceKey,
			parentPageId,
			false,
			resolvedPages,
		);

		const pages = flattenTree(confluenceNode, [], confluenceNode.version > 0);
		yield* Effect.try({
			try: () => assertUniquePageTargets(pages.map((page) => page.file)),
			catch: toError,
		});

		yield* Effect.sync(() => prepareAdfToUpload(pages, settings, { mapInlineComments: false }));
		for (const page of pages) {
			if (isMarkdownBackedFile(page.file)) {
				yield* updateMarkdownValuesEffect(page.file.absoluteFilePath, {
					publish: true,
					pageId: page.file.pageId,
					pageUrl: page.file.pageUrl,
				});
			}
		}

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

function resolveFileStructureEffect(
	confluenceClient: RequiredConfluenceClient,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string,
	topPageId: string,
	settings: ConfluenceSettings,
	resolvedPages: Map<LocalAdfFile, PageDetails | undefined>,
	root: boolean,
): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		if (!node.file) return yield* Effect.fail(new Error("Missing file on node"));
		const page = root
			? isMarkdownBackedFile(node.file)
				? yield* getPageDetailsByIdEffect(confluenceClient, parentPageId, settings)
				: undefined
			: yield* findExistingPageEffect(
					confluenceClient,
					node.file,
					settings,
					spaceKey,
					topPageId,
				);
		resolvedPages.set(node.file, page);
		const childSpaceKey = page?.spaceKey ?? spaceKey;
		const childTopPageId = page && childSpaceKey !== spaceKey ? page.id : topPageId;
		for (const child of node.children) {
			yield* resolveFileStructureEffect(
				confluenceClient,
				child,
				childSpaceKey,
				page?.id ?? parentPageId,
				childTopPageId,
				settings,
				resolvedPages,
				false,
			);
		}
	});
}

function createFileStructureInConfluenceEffect(
	settings: ConfluenceSettings,
	confluenceClient: RequiredConfluenceClient,
	node: LocalAdfFileTreeNode,
	spaceKey: string,
	parentPageId: string,
	createPage: boolean,
	resolvedPages: ReadonlyMap<LocalAdfFile, PageDetails | undefined>,
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
		let file: ConfluenceAdfFile = {
			...node.file,
			pageId: parentPageId,
			spaceKey,
			pageUrl: buildPageUrl(settings, spaceKey, parentPageId),
		};

		if (createPage) {
			const pageDetails =
				resolvedPages.get(node.file) ??
				(yield* createPageEffect(confluenceClient, node.file, spaceKey, parentPageId));
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
				const pageDetails = resolvedPages.get(node.file);
				if (!pageDetails)
					return yield* Effect.fail(new Error("Missing resolved root page"));

				file = {
					...file,
					pageId: pageDetails.id,
					spaceKey: pageDetails.spaceKey,
					pageTitle: pageDetails.pageTitle,
				};
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
				version = 0;
				adfContent = doc(p());
				pageTitle = "";
				ancestors = [];
				contentType = "page";
			}
		}

		const childDetails: ConfluenceTreeNode[] = yield* Effect.all(
			node.children.map((childNode) =>
				createFileStructureInConfluenceEffect(
					settings,
					confluenceClient,
					childNode,
					file.spaceKey,
					file.pageId,
					true,
					resolvedPages,
				),
			),
			// Serial traversal bounds requests across every tree depth. Per-parent
			// parallelism multiplies for nested folders and can overwhelm Confluence.
			{ concurrency: 1 },
		);

		const pageUrl = buildPageUrl(settings, file.spaceKey, file.pageId);
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

function getPageDetailsByIdEffect(
	confluenceClient: RequiredConfluenceClient,
	pageId: string,
	settings: ConfluenceSettings,
): Effect.Effect<PageDetails, unknown> {
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
				return Effect.fail(createMissingSpaceKeyError(pageId, settings.confluenceBaseUrl));
			}

			return Effect.succeed({
				id: contentById.id,
				title: contentById.title,
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
			});
		}),
	);
}

function buildPageUrl(settings: ConfluenceSettings, spaceKey: string, pageId: string): string {
	return `${resolveSiteUrl(settings)}/wiki/spaces/${spaceKey}/pages/${pageId}/`;
}

function findExistingPageEffect(
	confluenceClient: RequiredConfluenceClient,
	file: LocalAdfFile,
	settings: ConfluenceSettings,
	spaceKey: string,
	topPageId: string,
): Effect.Effect<PageDetails | undefined, unknown> {
	const findByTitle = () => findPageByTitleEffect(confluenceClient, file, spaceKey, topPageId);
	if (!file.pageId) return findByTitle();
	return getPageDetailsByIdEffect(confluenceClient, file.pageId, settings).pipe(
		// A stale ID is an in-memory resolution state. Preserve the user's publication
		// intent and previous target metadata until a replacement has been resolved.
		Effect.catch((error) => (isNotFoundError(error) ? findByTitle() : Effect.fail(error))),
	);
}

function findPageByTitleEffect(
	confluenceClient: RequiredConfluenceClient,
	file: LocalAdfFile,
	spaceKey: string,
	topPageId: string,
): Effect.Effect<PageDetails | undefined, unknown> {
	return Effect.tryPromise({
		try: () =>
			confluenceClient.content.getContent({
				type: file.contentType,
				spaceKey,
				title: file.pageTitle,
				expand: ["version", "body.atlas_doc_format", "ancestors"],
			}),
		catch: identity,
	}).pipe(
		Effect.flatMap((contentByTitle) => {
			const currentPage = contentByTitle.results[0];
			if (!currentPage) return Effect.succeed(undefined);
			if (contentByTitle.results.length > 1) {
				return Effect.fail(
					new Error(
						`Page title "${file.pageTitle}" is ambiguous; assign a connie-page-id before publishing`,
					),
				);
			}
			if (
				file.contentType === "page" &&
				!currentPage.ancestors?.some((ancestor) => ancestor.id === topPageId)
			) {
				return Effect.fail(
					new Error(
						`${file.pageTitle} is trying to overwrite a page outside the page tree from the selected top page`,
					),
				);
			}
			return Effect.succeed(pageDetailsFromContent(currentPage, file, spaceKey));
		}),
	);
}

function createPageEffect(
	confluenceClient: RequiredConfluenceClient,
	file: LocalAdfFile,
	spaceKey: string,
	parentPageId: string,
): Effect.Effect<PageDetails, unknown> {
	return Effect.tryPromise({
		try: () =>
			confluenceClient.content.createContent({
				space: { key: spaceKey },
				...(file.contentType === "page" ? { ancestors: [{ id: parentPageId }] } : {}),
				title: file.pageTitle,
				type: file.contentType,
				body: {
					atlas_doc_format: {
						value: blankPageAdf,
						representation: "atlas_doc_format",
					},
				},
				expand: ["version", "body.atlas_doc_format", "ancestors"],
			}),
		catch: identity,
	}).pipe(Effect.map((page) => pageDetailsFromContent(page, file, spaceKey)));
}

function pageDetailsFromContent(
	page: ConfluenceContent,
	file: LocalAdfFile,
	spaceKey: string,
): PageDetails {
	return {
		id: page.id,
		title: file.pageTitle,
		version: page.version?.number ?? 1,
		lastUpdatedBy: page.version?.by?.accountId ?? "NO ACCOUNT ID",
		existingAdf: page.body?.atlas_doc_format?.value,
		pageTitle: page.title,
		ancestors: page.ancestors?.map((ancestor) => ({ id: ancestor.id })) ?? [],
		spaceKey,
		contentType: page.type,
	};
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
