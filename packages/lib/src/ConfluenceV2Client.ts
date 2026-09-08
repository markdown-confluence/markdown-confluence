import { createV2Client } from "confluence.js";
import type { Client } from "confluence.js/core";
import type { ConfluenceFetch } from "./ConfluenceFetch";
import {
	cancellableClient,
	PublishCancelledError,
	registerPublishCancellation,
} from "./PublishCancellation";
import type {
	ConfluenceContent,
	ContentArray,
	AttachmentArray,
	LabelArray,
	ContentQuery,
	ContentById,
	ContentWrite,
	ContentUpdate,
} from "./ConfluenceClient";
import {
	createConfluenceTransport,
	ConfluenceRequestError as ConfluenceV2Error,
} from "./ConfluenceTransport";
import type {
	V2Ancestor,
	V2Attachment,
	V2CreatePageBody,
	V2Label,
	V2MultiEntityResult,
	V2Page,
	V2UpdatePageBody,
} from "./ConfluenceV2Types";
export { ConfluenceV2Error };
const ATLAS_DOC_FORMAT = "atlas_doc_format";

class SpaceKeyCache {
	private readonly keyToId = new Map<string, string>();
	private readonly idToKey = new Map<string, string>();

	constructor(private readonly sdk: ReturnType<typeof createV2Client>) {}

	record(key: string, id: string): void {
		this.keyToId.set(key, id);
		this.idToKey.set(id, key);
	}

	copyFrom(source: SpaceKeyCache): void {
		for (const [key, id] of source.keyToId) this.record(key, id);
	}

	keyForId(id: string): string | undefined {
		return this.idToKey.get(id);
	}

	async resolveKeyToId(key: string): Promise<string> {
		const cached = this.keyToId.get(key);
		if (cached) {
			return cached;
		}

		const result = await this.sdk.space.getSpaces({ keys: [key], limit: 1 });
		const space = result.results?.[0];
		if (!space?.id || !space.key) {
			throw new ConfluenceV2Error(`Confluence space not found for key "${key}"`, 404, result);
		}
		this.record(space.key, space.id);
		return space.id;
	}

	async resolveIdToKey(id: string): Promise<string> {
		const cached = this.idToKey.get(id);
		if (cached) {
			return cached;
		}

		const space = await this.sdk.space.getSpaceById({ id: sdkId(id) });
		if (!space.id || !space.key)
			throw new ConfluenceV2Error("Confluence space response is incomplete", 502, undefined);
		this.record(space.key, space.id);
		return space.key;
	}
}

function notImplemented(method: string): never {
	throw new ConfluenceV2Error(
		`${method} is not implemented by ConfluenceV2Client; only getContent, getContentById, createContent, and updateContent are supported`,
		501,
		undefined,
	);
}

/** Adapts the SDK's v2 page and blog-post responses to the publisher's content model. */
export class ConfluenceV2Client {
	private readonly spaces: SpaceKeyCache;
	private readonly transport: Client;
	private readonly sdk: ReturnType<typeof createV2Client>;
	private readonly apiRoot: URL;
	private readonly contentTypes = new Map<string, "page" | "blogpost">();
	private readonly contentSpaces = new Map<string, string>();

	constructor(
		baseUrl: string,
		authentication: Client | string | { email: string; apiToken: string },
		requestHeaders: Record<string, string> = {},
		fetchRequest?: ConfluenceFetch,
	) {
		this.apiRoot = new URL(`${baseUrl.replace(/\/$/, "")}/wiki/api/v2/`);
		this.transport =
			typeof authentication === "object" && "sendRequest" in authentication
				? authentication
				: createConfluenceTransport(
						{
							host: baseUrl,
							headers: requestHeaders,
							auth:
								typeof authentication === "string"
									? { type: "bearer", token: authentication }
									: { type: "basic", ...authentication },
						},
						fetchRequest,
					);
		this.sdk = createV2Client(this.transport);
		this.spaces = new SpaceKeyCache(this.sdk);
		registerPublishCancellation(this, (signal) => {
			const scoped = new ConfluenceV2Client(
				baseUrl,
				cancellableClient(this.transport, signal),
			);
			scoped.spaces.copyFrom(this.spaces);
			for (const [id, type] of this.contentTypes) scoped.contentTypes.set(id, type);
			for (const [id, key] of this.contentSpaces) scoped.contentSpaces.set(id, key);
			return scoped;
		});
	}

	private nextPath(currentPath: string, next: string): string {
		const gatewayPath = next.startsWith("/wiki/api/v2/")
			? this.apiRoot.pathname.slice(0, -"/wiki/api/v2/".length) + next
			: next;
		const url = new URL(gatewayPath, new URL(currentPath.slice(1), this.apiRoot));
		if (
			url.origin !== this.apiRoot.origin ||
			!url.pathname.startsWith(this.apiRoot.pathname) ||
			url.username ||
			url.password
		) {
			throw new ConfluenceV2Error(
				"Confluence pagination points outside the configured API",
				502,
				undefined,
			);
		}
		return `/${url.pathname.slice(this.apiRoot.pathname.length)}${url.search}`;
	}

	private async collectResults<T>(
		path: string,
		first: Promise<V2MultiEntityResult<T>>,
	): Promise<T[]> {
		const results: T[] = [];
		const visited = new Set<string>();
		let current: string | undefined = path;
		let response = await first;
		while (current) {
			if (visited.has(current))
				throw new ConfluenceV2Error(
					"Confluence pagination repeated a page",
					502,
					undefined,
				);
			visited.add(current);
			results.push(...response.results);
			current = response._links?.next
				? this.nextPath(current, response._links.next)
				: undefined;
			if (current && !visited.has(current))
				response = await this.transport.sendRequest({ url: `/wiki/api/v2${current}` });
		}
		return results;
	}

	async getContent<T = ContentArray>(parameters?: ContentQuery, callback?: never): Promise<T> {
		void callback;
		const contentType = parameters?.type === "blogpost" ? "blogpost" : "page";

		const spaceKey = parameters?.spaceKey;
		if (!spaceKey) {
			throw new ConfluenceV2Error(
				"getContent requires a spaceKey when using the v2 client",
				400,
				undefined,
			);
		}

		const spaceId = await this.spaces.resolveKeyToId(spaceKey);
		const getInSpace =
			contentType === "blogpost"
				? this.sdk.blogPost.getBlogPostsInSpace
				: this.sdk.page.getPagesInSpace;
		const result = await getInSpace({
			id: sdkId(spaceId),
			bodyFormat: ATLAS_DOC_FORMAT,
			limit: 1,
			title: parameters?.title,
		});

		const wantsAncestors = expandIncludes(parameters?.expand, "ancestors");
		const contents = await Promise.all(
			(result.results ?? []).map((page) =>
				this.adaptPage(checkedPage(page), spaceKey, wantsAncestors, contentType),
			),
		);

		const contentArray: ContentArray = {
			results: contents,
			start: 0,
			limit: 1,
			size: contents.length,
			_links: { self: "" },
		};
		return contentArray as T;
	}

	async getContentById<T = ConfluenceContent>(
		parameters: ContentById,
		callback?: never,
	): Promise<T> {
		void callback;

		let contentType = this.contentTypes.get(parameters.id) ?? "page";
		const query = { id: sdkId(parameters.id), bodyFormat: ATLAS_DOC_FORMAT };
		const page = checkedPage(
			await (contentType === "blogpost"
				? this.sdk.blogPost.getBlogPostById(query)
				: this.sdk.page.getPageById(query).catch((error) => {
						if (!(error instanceof ConfluenceV2Error) || error.response.status !== 404)
							throw error;
						contentType = "blogpost";
						return this.sdk.blogPost.getBlogPostById(query);
					})),
		);

		const spaceKey = await this.spaces.resolveIdToKey(page.spaceId);
		const wantsAncestors = expandIncludes(parameters.expand, "ancestors");
		const content = await this.adaptPage(page, spaceKey, wantsAncestors, contentType);
		return content as T;
	}

	async createContent<T = ConfluenceContent>(
		parameters?: ContentWrite,
		callback?: never,
	): Promise<T> {
		void callback;
		const contentType = parameters?.type === "blogpost" ? "blogpost" : "page";

		const spaceKey = parameters?.space?.key;
		if (!spaceKey) {
			throw new ConfluenceV2Error(
				"createContent requires space.key when using the v2 client",
				400,
				undefined,
			);
		}
		const spaceId = await this.spaces.resolveKeyToId(spaceKey);
		const parentId = parameters?.ancestors?.at(-1)?.id;

		const requestBody: V2CreatePageBody = {
			spaceId,
			status: "current",
			title: parameters?.title ?? "",
			...(parentId && contentType === "page" ? { parentId } : {}),
			body: {
				representation: ATLAS_DOC_FORMAT,
				value: parameters?.body?.atlas_doc_format?.value ?? "",
			},
		};

		const page = checkedPage(
			await (contentType === "blogpost"
				? this.sdk.blogPost.createBlogPost({ body: requestBody })
				: this.sdk.page.createPage({ body: requestBody })),
		);

		const content = await this.adaptPage(page, spaceKey, false, contentType);
		return content as T;
	}

	async updateContent<T = ConfluenceContent>(
		parameters: ContentUpdate,
		callback?: never,
	): Promise<T> {
		void callback;
		const contentType = parameters.type === "blogpost" ? "blogpost" : "page";
		// Resolve response metadata before writing so a completed PUT needs no follow-up
		// request and can still be returned successfully if publishing is cancelled.
		if (!this.spaces.keyForId(this.contentSpaces.get(parameters.id) ?? ""))
			await this.getContentById({ id: parameters.id });

		const parentId = parameters.ancestors?.at(-1)?.id;
		const requestBody: V2UpdatePageBody = {
			id: parameters.id,
			status: "current",
			title: parameters.title,
			...(parentId && contentType === "page" ? { parentId } : {}),
			body: {
				representation: ATLAS_DOC_FORMAT,
				value: parameters.body?.atlas_doc_format?.value ?? "",
			},
			version: {
				number: parameters.version.number,
				message: parameters.version.message ?? "",
			},
		};

		const page = checkedPage(
			await (contentType === "blogpost"
				? this.sdk.blogPost.updateBlogPost({ id: sdkId(parameters.id), body: requestBody })
				: this.sdk.page.updatePage({ id: sdkId(parameters.id), body: requestBody })),
		);

		let spaceKey = this.spaces.keyForId(page.spaceId);
		if (!spaceKey) {
			try {
				spaceKey = await this.spaces.resolveIdToKey(page.spaceId);
			} catch (error) {
				// A move can return a previously unknown space. Keep the completed write
				// successful if cancellation prevents resolving that optional metadata.
				if (!(error instanceof PublishCancelledError)) throw error;
			}
		}
		const content = await this.adaptPage(page, spaceKey, false, contentType);
		return content as T;
	}

	/**
	 * Lists page or blog-post attachments via v2 and adapts them to the
	 * publisher's attachment model.
	 *
	 * v2 does not return a media `collectionName`, but Confluence derives it
	 * deterministically as `contentId-{pageId}` (the same value the v1 upload
	 * path computes), so it is reconstructed here to preserve the publisher's
	 * skip-unchanged-attachment optimization.
	 */
	async getAttachments<T = AttachmentArray>(
		parameters: ContentById,
		callback?: never,
	): Promise<T> {
		void callback;

		const pageId = parameters.id;
		const blogpost = this.contentTypes.get(pageId) === "blogpost";
		const attachments = await this.collectResults<V2Attachment>(
			`/${blogpost ? "blogposts" : "pages"}/${encodeURIComponent(pageId)}/attachments?limit=250`,
			(blogpost
				? this.sdk.attachment.getBlogpostAttachments
				: this.sdk.attachment.getPageAttachments)({
				id: sdkId(pageId),
				limit: 250,
			}) as unknown as Promise<V2MultiEntityResult<V2Attachment>>,
		);

		const collectionName = `contentId-${pageId}`;
		const results = attachments.map((attachment) => ({
			id: attachment.id,
			version: attachment.version
				? {
						number: attachment.version.number,
						by: { accountId: attachment.version.authorId },
						when: attachment.version.createdAt,
						message: attachment.version.message,
					}
				: undefined,
			title: attachment.title,
			metadata: { comment: attachment.comment ?? "" },
			extensions: { fileId: attachment.fileId ?? "", collectionName },
		}));

		const contentArray = {
			results,
			start: 0,
			limit: results.length,
			size: results.length,
			_links: { self: "" },
		};
		return contentArray as unknown as T;
	}

	/**
	 * Lists page or blog-post labels via v2. Label writes still use the
	 * supported v1 endpoints; both versions share the same credentials.
	 */
	async getLabelsForContent<T = LabelArray>(
		parameters: ContentById,
		callback?: never,
	): Promise<T> {
		void callback;

		const blogpost = this.contentTypes.get(parameters.id) === "blogpost";
		const result = await this.collectResults<V2Label>(
			`/${blogpost ? "blogposts" : "pages"}/${encodeURIComponent(parameters.id)}/labels?limit=250`,
			(blogpost ? this.sdk.label.getBlogPostLabels : this.sdk.label.getPageLabels)({
				id: sdkId(parameters.id),
				limit: 250,
			}) as Promise<V2MultiEntityResult<V2Label>>,
		);

		const labels = result.map((label) => ({
			prefix: label.prefix ?? "global",
			name: label.name,
			id: label.id,
			label: label.name,
		}));

		const labelArray = {
			results: labels,
			start: 0,
			limit: labels.length,
			size: labels.length,
			_links: { self: "" },
		};
		return labelArray as unknown as T;
	}

	/** Adapts a v2 page or blog post to the publisher's `ConfluenceContent` model. */
	private async adaptPage(
		page: V2Page,
		spaceKey: string | undefined,
		includeAncestors: boolean,
		contentType: "page" | "blogpost",
	): Promise<ConfluenceContent> {
		this.contentTypes.set(page.id, contentType);
		this.contentSpaces.set(page.id, page.spaceId);
		const ancestors =
			includeAncestors && contentType === "page" ? await this.fetchAncestors(page) : [];
		const adfValue = page.body?.atlas_doc_format?.value;

		const content = {
			id: page.id,
			type: contentType,
			status: page.status,
			title: page.title,
			...(spaceKey ? { space: { key: spaceKey } } : {}),
			version: {
				number: page.version?.number ?? 1,
				by: { accountId: page.version?.authorId ?? "" },
			},
			ancestors: ancestors.map((ancestor) => ({ id: ancestor.id })),
			body: {
				atlas_doc_format:
					adfValue === undefined
						? undefined
						: { value: adfValue, representation: ATLAS_DOC_FORMAT },
			},
		};

		return content as unknown as ConfluenceContent;
	}

	/** Follows the highest returned ancestor until the complete tree is known. */
	private async fetchAncestors(page: V2Page): Promise<V2Ancestor[]> {
		const ancestors: V2Ancestor[] = [];
		const visited = new Set<string>([page.id]);
		let current: V2Ancestor | undefined = { id: page.id, type: "page" };
		const routes = {
			page: this.sdk.ancestors.getPageAncestors,
			whiteboard: this.sdk.ancestors.getWhiteboardAncestors,
			database: this.sdk.ancestors.getDatabaseAncestors,
			folder: this.sdk.ancestors.getFolderAncestors,
			embed: this.sdk.ancestors.getSmartLinkAncestors,
		};

		while (current) {
			const route = routes[current.type as keyof typeof routes];
			if (!route)
				throw new ConfluenceV2Error("Unsupported ancestor content type", 502, undefined);
			// Ancestor batches run root-to-parent; fetch the next batch above its first entry.
			const response = await route({ id: sdkId(current.id), limit: 250 });
			const batch = (response.results ?? []) as V2Ancestor[];
			for (const ancestor of batch) {
				if (visited.has(ancestor.id))
					throw new ConfluenceV2Error(
						"Confluence ancestors contain a cycle",
						502,
						undefined,
					);
				visited.add(ancestor.id);
			}
			ancestors.unshift(...batch);
			current = batch[0];
		}
		return ancestors;
	}

	// --- Unsupported Api.Content methods (not used by the publisher) ---
	// These mirror confluence.js method names so the adapter can stand in for
	// Api.Content; the names are dictated by that API surface.

	archivePages(): never {
		notImplemented("archivePages");
	}

	// oxlint-disable-next-line descriptive/no-vague-names -- confluence.js API method name
	publishLegacyDraft(): never {
		notImplemented("publishLegacyDraft");
	}

	// oxlint-disable-next-line descriptive/no-vague-names -- confluence.js API method name
	publishSharedDraft(): never {
		notImplemented("publishSharedDraft");
	}

	searchContentByCQL(): never {
		notImplemented("searchContentByCQL");
	}

	deleteContent(): never {
		notImplemented("deleteContent");
	}

	getHistoryForContent(): never {
		notImplemented("getHistoryForContent");
	}
}

function expandIncludes(
	expand: ContentQuery["expand"] | ContentById["expand"],
	field: string,
): boolean {
	if (!expand) {
		return false;
	}
	if (Array.isArray(expand)) {
		return expand.includes(field);
	}
	return String(expand)
		.split(",")
		.map((part) => part.trim())
		.includes(field);
}

function sdkId(id: string): number {
	const number = Number(id);
	if (!/^\d+$/.test(id) || !Number.isSafeInteger(number) || number <= 0)
		throw new Error("Confluence content ID must be a positive safe integer");
	return number;
}
function checkedPage(page: {
	id?: string | undefined;
	spaceId?: string | undefined;
	title?: string | undefined;
	status?: string | undefined;
}): V2Page {
	if (!page.id || !page.spaceId || page.title === undefined || !page.status)
		throw new ConfluenceV2Error("Confluence page response is incomplete", 502, undefined);
	return page as V2Page;
}
