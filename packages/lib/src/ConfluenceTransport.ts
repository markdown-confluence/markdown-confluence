import { Buffer } from "node:buffer";
import type { Client, ClientConfig, SendRequestOptions } from "confluence.js/core";
import type { ConfluenceFetch } from "./ConfluenceFetch";

/** Errors expose status and response data, never credentials or request configuration. */
export class ConfluenceRequestError extends Error {
	readonly response: { status: number; data: unknown };
	constructor(message: string, status: number, data: unknown) {
		super(message);
		this.name = "ConfluenceRequestError";
		this.response = { status, data };
	}
}

/** Shared SDK transport for Node and Obsidian. Never replay an ambiguous write. */
export function createConfluenceTransport(
	config: ClientConfig,
	fetchRequest: ConfluenceFetch = (url, init) => fetch(url, init),
): Client {
	const host = new URL((config.host ?? "").replace(/\/$/, "") + "/");
	if (host.protocol !== "https:" || host.username || host.password || host.search || host.hash)
		throw new Error(
			"Confluence Cloud requires an HTTPS API base URL without credentials or a query",
		);
	const auth = config.auth;
	const authorization =
		auth?.type === "basic"
			? `Basic ${Buffer.from(`${auth.email}:${auth.apiToken}`, "utf8").toString("base64")}`
			: auth?.type === "bearer" && "token" in auth
				? `Bearer ${auth.token}`
				: undefined;
	if (!authorization)
		throw new Error("Resolve Confluence credentials before creating the transport");
	return {
		async sendRequest<T>(options: SendRequestOptions<T>): Promise<T> {
			// Endpoint paths come from the SDK or a validated pagination link, never another host.
			if (!options.url.startsWith("/wiki/") || options.url.includes("\\"))
				throw new Error("Confluence request must use a Cloud API path");
			const url = new URL(options.url.slice(1), host);
			if (url.origin !== host.origin || !url.pathname.startsWith(host.pathname + "wiki/"))
				throw new Error("Confluence request points outside the configured API");
			for (const [key, value] of Object.entries(options.searchParams ?? {})) {
				if (value !== undefined && value !== null)
					url.searchParams.set(
						key,
						Array.isArray(value) ? value.join(",") : String(value),
					);
			}
			const method = options.method ?? "GET";
			const headers = new Headers(config.headers);
			new Headers(options.headers).forEach((value, key) => headers.set(key, value));
			headers.set("Authorization", authorization);
			if (!headers.has("Accept")) headers.set("Accept", "application/json");
			const multipart = options.body instanceof FormData;
			const body =
				options.body == null
					? undefined
					: multipart
						? (options.body as FormData)
						: JSON.stringify(options.body);
			if (multipart) headers.delete("Content-Type");
			else if (body !== undefined) headers.set("Content-Type", "application/json");
			const signal = AbortSignal.timeout(30_000);
			const read = method === "GET" || method === "HEAD";
			for (let attempt = 0; ; attempt++) {
				if (signal.aborted) throw new Error("Confluence request aborted");
				let response: Awaited<ReturnType<ConfluenceFetch>>;
				try {
					response = await fetchRequest(url.toString(), {
						method,
						headers,
						...(body === undefined ? {} : { body }),
						redirect: "error",
						signal,
					});
				} catch (error) {
					if (signal.aborted) throw new Error("Confluence request aborted");
					const code = networkErrorCode(error);
					if (
						read &&
						attempt < 2 &&
						[
							"ECONNRESET",
							"ETIMEDOUT",
							"ECONNABORTED",
							"ERR_NETWORK",
							"EAI_AGAIN",
							"UND_ERR_SOCKET",
							"UND_ERR_CONNECT_TIMEOUT",
						].includes(code)
					) {
						await waitForRetry(250 * 2 ** attempt, signal);
						continue;
					}
					throw new ConfluenceRequestError(
						`Confluence ${method} ${url.pathname} failed: ${code}`,
						0,
						undefined,
					);
				}
				if (response.status === 429 && attempt < 2 && (read || !multipart)) {
					const delay = rateLimitDelay(
						response.headers?.get("retry-after") ?? undefined,
						attempt,
					);
					if (delay !== undefined) {
						await waitForRetry(delay, signal);
						continue;
					}
				}
				let payload: unknown;
				if (response.status !== 204) {
					try {
						payload = await response.json();
					} catch {
						payload = undefined;
					}
				}
				if (!response.ok)
					throw new ConfluenceRequestError(
						`Confluence ${method} ${url.pathname} failed: HTTP ${response.status}`,
						response.status,
						payload,
					);
				if (response.status === 204) return undefined as T;
				if (options.schema) {
					const parsed = options.schema.safeParse(payload);
					if (!parsed.success)
						throw new ConfluenceRequestError(
							`Confluence ${method} ${url.pathname} returned an invalid response`,
							502,
							undefined,
						);
					return parsed.data;
				}
				return payload as T;
			}
		},
	};
}

function networkErrorCode(error: unknown): string {
	const code =
		(error as { code?: unknown; cause?: { code?: unknown } })?.code ??
		(error as { cause?: { code?: unknown } })?.cause?.code;
	return typeof code === "string" && /^[A-Z_]+$/.test(code) ? code : "network error";
}
function rateLimitDelay(value: string | undefined, attempt: number): number | undefined {
	const seconds = value === undefined ? undefined : Number(value);
	const delay =
		value === undefined
			? 1000 * 2 ** attempt
			: Number.isFinite(seconds)
				? seconds! * 1000
				: Date.parse(value) - Date.now();
	return Number.isFinite(delay) && delay <= 30_000 ? Math.max(0, delay) : undefined;
}
function waitForRetry(delay: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", abort);
			reject(new Error("Confluence request aborted"));
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, delay);
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
	});
}
