import type { Models, Parameters } from "confluence.js";
import type {
	V2Ancestor,
	V2Attachment,
	V2CreatePageBody,
	V2Label,
	V2MultiEntityResult,
	V2Page,
	V2Space,
	V2UpdatePageBody,
} from "./ConfluenceV2Types";

/**
 * Default representation used for page bodies. The publisher always works in
 * Atlassian Document Format.
 */
const ATLAS_DOC_FORMAT = "atlas_doc_format";

/** Maximum time to wait for each Confluence v2 API request. */
const CONFLUENCE_V2_TIMEOUT_MS = 15_000;

/**
 * Error thrown when a v2 request fails. Mirrors the shape that `confluence.js`
 * surfaces (a `message` plus a `response.data` payload) so that the publisher's
 * existing error handling continues to work unchanged.
 */
export class ConfluenceV2Error extends Error {
	readonly response: { status: number; data: unknown };

	constructor(message: string, status: number, data: unknown) {
		super(message);
		this.name = "ConfluenceV2Error";
		this.response = { status, data };
	}
}

/**
 * Resolves and caches Confluence space key <-> id mappings for the lifetime of
 * a single invocation. The v2 API addresses spaces by numeric id, while the
 * publisher works in terms of space keys, so both directions are needed.
 */
type V2Request = <T>(method: string, path: string, body?: unknown) => Promise<T>;

class SpaceKeyCache {
	private readonly keyToId = new Map<string, string>();
	private readonly idToKey = new Map<string, string>();

	constructor(private readonly request: V2Request) {}

	record(key: string, id: string): void {
		this.keyToId.set(key, id);
		this.idToKey.set(id, key);
	}

	async resolveKeyToId(key: string): Promise<string> {
		const cached = this.keyToId.get(key);
		if (cached) {
			return cached;
		}

		const result = await this.request<V2MultiEntityResult<V2Space>>(
			"GET",
			`/spaces?keys=${encodeURIComponent(key)}&limit=1`,
		);
		const space = result.results[0];
		if (!space) {
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

		const space = await this.request<V2Space>("GET", `/spaces/${encodeURIComponent(id)}`);
		this.record(space.key, space.id);
		return space.key;
	}
}

/**
 * Performs a Confluence REST API v2 request and parses the JSON response,
 * wrapping failures in {@link ConfluenceV2Error}.
 *
 * @param baseUrl - The Confluence base URL, typically the OAuth API gateway
 *   (`https://api.atlassian.com/ex/confluence/{cloudId}`).
 * @param path - The v2 path beginning with `/` (e.g. `/pages/123`), appended
 *   after `/wiki/api/v2`.
 */
async function requestV2<T>(
	baseUrl: string,
	accessToken: string,
	method: string,
	path: string,
	body?: unknown,
	requestHeaders: Record<string, string> = {},
): Promise<T> {
	const url = `${baseUrl.replace(/\/$/, "")}/wiki/api/v2${path}`;

	let response: Response;
	try {
		response = await fetch(url, {
			method,
			redirect: "error",
			headers: buildRequestHeaders(accessToken, requestHeaders, body),
			signal: AbortSignal.timeout(CONFLUENCE_V2_TIMEOUT_MS),
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	} catch (error) {
		throw new ConfluenceV2Error(
			`Failed to reach the Confluence v2 API (${method} ${path}): ${getErrorMessage(error)}`,
			0,
			undefined,
		);
	}

	if (!response.ok) {
		const data = await readJsonSafe(response);
		throw new ConfluenceV2Error(
			`Confluence v2 request failed (${method} ${path}) with status ${response.status} ${response.statusText}`,
			response.status,
			data,
		);
	}

	if (response.status === 204) {
		return undefined as T;
	}

	return (await response.json()) as T;
}

function buildRequestHeaders(
	accessToken: string,
	requestHeaders: Record<string, string>,
	body: unknown,
): Headers {
	const headers = new Headers(requestHeaders);
	headers.set("Authorization", `Bearer ${accessToken}`);
	if (!headers.has("Accept")) headers.set("Accept", "application/json");
	if (body !== undefined) headers.set("Content-Type", "application/json");
	return headers;
}

async function readJsonSafe(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function notImplemented(method: string): never {
	throw new ConfluenceV2Error(
		`${method} is not implemented by ConfluenceV2Client; only getContent, getContentById, createContent, and updateContent are supported`,
		501,
		undefined,
	);
}

/**
 * A v2-backed implementation of the subset of `confluence.js`'s `Api.Content`
 * surface that the publisher uses. It exists because the legacy v1 `/content`
 * CRUD endpoints return `410 Gone` when accessed via OAuth on Confluence Cloud,
 * while the equivalent v2 (`/wiki/api/v2/pages`) endpoints work.
 *
 * Responses are adapted back into the v1 `Models.Content` / `Models.ContentArray`
 * shapes the publisher expects, so downstream code requires no changes.
 *
 * Only pages are supported; blog posts are intentionally out of scope and will
 * throw if requested.
 *
 * This implements the subset of `Api.Content` the publisher invokes. It is not
 * declared `implements Api.Content` because that interface exposes
 * callback-style overloads the publisher never uses; callers wire it in as the
 * `content` member of {@link RequiredConfluenceClient} via a cast.
 */
export class ConfluenceV2Client {
	private readonly spaces: SpaceKeyCache;
	private readonly request: V2Request;
	private readonly apiRoot: URL;

	constructor(baseUrl: string, accessToken: string, requestHeaders: Record<string, string> = {}) {
		this.apiRoot = new URL(`${baseUrl.replace(/\/$/, "")}/wiki/api/v2/`);
		this.request = (method, path, body) =>
			requestV2(baseUrl, accessToken, method, path, body, requestHeaders);
		this.spaces = new SpaceKeyCache(this.request);
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

	private async collectResults<T>(path: string): Promise<T[]> {
		const results: T[] = [];
		const visited = new Set<string>();
		let current: string | undefined = path;
		while (current) {
			if (visited.has(current))
				throw new ConfluenceV2Error(
					"Confluence pagination repeated a page",
					502,
					undefined,
				);
			visited.add(current);
			const response: V2MultiEntityResult<T> = await this.request("GET", current);
			results.push(...response.results);
			current = response._links?.next
				? this.nextPath(current, response._links.next)
				: undefined;
		}
		return results;
	}

	async getContent<T = Models.ContentArray>(
		parameters?: Parameters.GetContent,
		callback?: never,
	): Promise<T> {
		void callback;
		assertNotBlogpost(parameters?.type);

		const spaceKey = parameters?.spaceKey;
		if (!spaceKey) {
			throw new ConfluenceV2Error(
				"getContent requires a spaceKey when using the v2 client",
				400,
				undefined,
			);
		}

		const spaceId = await this.spaces.resolveKeyToId(spaceKey);
		const query = new URLSearchParams({ "body-format": ATLAS_DOC_FORMAT, limit: "1" });
		if (parameters?.title) {
			query.set("title", parameters.title);
		}

		const result = await this.request<V2MultiEntityResult<V2Page>>(
			"GET",
			`/spaces/${encodeURIComponent(spaceId)}/pages?${query.toString()}`,
		);

		const wantsAncestors = expandIncludes(parameters?.expand, "ancestors");
		const contents = await Promise.all(
			result.results.map((page) => this.adaptPage(page, spaceKey, wantsAncestors)),
		);

		const contentArray: Models.ContentArray = {
			results: contents,
			start: 0,
			limit: 1,
			size: contents.length,
			_links: { self: "" },
		};
		return contentArray as T;
	}

	async getContentById<T = Models.Content>(
		parameters: Parameters.GetContentById,
		callback?: never,
	): Promise<T> {
		void callback;

		const page = await this.request<V2Page>(
			"GET",
			`/pages/${encodeURIComponent(parameters.id)}?body-format=${ATLAS_DOC_FORMAT}`,
		);

		const spaceKey = await this.spaces.resolveIdToKey(page.spaceId);
		const wantsAncestors = expandIncludes(parameters.expand, "ancestors");
		const content = await this.adaptPage(page, spaceKey, wantsAncestors);
		return content as T;
	}

	async createContent<T = Models.Content>(
		parameters?: Parameters.CreateContent,
		callback?: never,
	): Promise<T> {
		void callback;
		assertNotBlogpost(parameters?.type);

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
			...(parentId ? { parentId } : {}),
			body: {
				representation: ATLAS_DOC_FORMAT,
				value: parameters?.body?.atlas_doc_format?.value ?? "",
			},
		};

		const page = await this.request<V2Page>("POST", "/pages", requestBody);

		const content = await this.adaptPage(page, spaceKey, false);
		return content as T;
	}

	async updateContent<T = Models.Content>(
		parameters: Parameters.UpdateContent,
		callback?: never,
	): Promise<T> {
		void callback;
		assertNotBlogpost(parameters.type);

		const parentId = parameters.ancestors?.at(-1)?.id;
		const requestBody: V2UpdatePageBody = {
			id: parameters.id,
			status: "current",
			title: parameters.title,
			...(parentId ? { parentId } : {}),
			body: {
				representation: ATLAS_DOC_FORMAT,
				value: parameters.body?.atlas_doc_format?.value ?? "",
			},
			version: {
				number: parameters.version.number,
				message: parameters.version.message ?? "",
			},
		};

		const page = await this.request<V2Page>(
			"PUT",
			`/pages/${encodeURIComponent(parameters.id)}`,
			requestBody,
		);

		const spaceKey = await this.spaces.resolveIdToKey(page.spaceId);
		const content = await this.adaptPage(page, spaceKey, false);
		return content as T;
	}

	/**
	 * Lists a page's attachments via v2 (`GET /wiki/api/v2/pages/{id}/attachments`)
	 * and adapts them to the v1 `getAttachments` shape the publisher consumes.
	 *
	 * v2 does not return a media `collectionName`, but Confluence derives it
	 * deterministically as `contentId-{pageId}` (the same value the v1 upload
	 * path computes), so it is reconstructed here to preserve the publisher's
	 * skip-unchanged-attachment optimization.
	 */
	async getAttachments<T = Models.ContentArray>(
		parameters: Parameters.GetAttachments,
		callback?: never,
	): Promise<T> {
		void callback;

		const pageId = parameters.id;
		const attachments = await this.collectResults<V2Attachment>(
			`/pages/${encodeURIComponent(pageId)}/attachments?limit=250`,
		);

		const collectionName = `contentId-${pageId}`;
		const results = attachments.map((attachment) => ({
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
	 * Lists a page's labels via v2 (`GET /wiki/api/v2/pages/{id}/labels`) and
	 * adapts them to the v1 `getLabelsForContent` shape (results with `name` and
	 * `label`). The v1 label endpoint is gone under OAuth, but v2 labels read
	 * works with the granted scopes.
	 */
	async getLabelsForContent<T = Models.LabelArray>(
		parameters: Parameters.GetLabelsForContent,
		callback?: never,
	): Promise<T> {
		void callback;

		const result = await this.collectResults<V2Label>(
			`/pages/${encodeURIComponent(parameters.id)}/labels?limit=250`,
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

	/** Adapts a v2 page into the v1 `Models.Content` shape the publisher expects. */
	private async adaptPage(
		page: V2Page,
		spaceKey: string,
		includeAncestors: boolean,
	): Promise<Models.Content> {
		const ancestors = includeAncestors ? await this.fetchAncestors(page) : [];
		const adfValue = page.body?.atlas_doc_format?.value;

		const content = {
			id: page.id,
			type: "page",
			status: page.status,
			title: page.title,
			space: { key: spaceKey },
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

		return content as unknown as Models.Content;
	}

	/** Follows the highest returned ancestor until the complete tree is known. */
	private async fetchAncestors(page: V2Page): Promise<V2Ancestor[]> {
		const ancestors: V2Ancestor[] = [];
		const visited = new Set<string>([page.id]);
		let current: V2Ancestor | undefined = { id: page.id, type: "page" };
		const routes: Record<string, string> = {
			page: "pages",
			whiteboard: "whiteboards",
			database: "databases",
			folder: "folders",
			embed: "embeds",
		};
		while (current) {
			const route: string | undefined = routes[current.type];
			if (!route)
				throw new ConfluenceV2Error("Unsupported ancestor content type", 502, undefined);
			// Ancestor batches run root-to-parent; fetch the next batch above its first entry.
			const response: V2MultiEntityResult<V2Ancestor> = await this.request(
				"GET",
				`/${route}/${encodeURIComponent(current.id)}/ancestors?limit=250`,
			);
			const batch = response.results;
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

function assertNotBlogpost(type: string | undefined): void {
	if (type === "blogpost") {
		throw new ConfluenceV2Error(
			"The v2 client does not support blog posts yet; only pages are supported",
			400,
			undefined,
		);
	}
}

function expandIncludes(
	expand: Parameters.GetContent["expand"] | Parameters.GetContentById["expand"],
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
