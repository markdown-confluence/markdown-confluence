import axios, { AxiosAdapter, AxiosError } from "axios";

/** Preserve useful errors across confluence.js's Axios error handler. */
export function createConfluenceTransport(
	adapter: AxiosAdapter = (config) => axios.getAdapter(axios.defaults.adapter)(config),
): AxiosAdapter {
	return async (config) => {
		for (let attempt = 0; ; attempt++) {
			try {
				return await adapter(config);
			} catch (error) {
				if (!axios.isAxiosError(error)) throw error;
				const delay = retryDelay(error, attempt);
				if (delay !== undefined && !config.signal?.aborted) {
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}
				const status = error.response?.status;
				const pathname = new URL(config.url ?? "", config.baseURL).pathname;
				// Do not expose Axios config, authorization headers or request bodies.
				throw Object.assign(
					new Error(
						`Confluence ${config.method?.toUpperCase() ?? "GET"} ${pathname} failed: ${status ? `HTTP ${status}` : (error.code ?? "network error")}`,
					),
					{
						response: error.response
							? { status, data: error.response.data }
							: undefined,
					},
				);
			}
		}
	};
}

function retryDelay(error: AxiosError, attempt: number): number | undefined {
	if (attempt >= 2) return undefined;
	const config = error.config;
	const method = config?.method?.toUpperCase() ?? "GET";
	const read = method === "GET" || method === "HEAD";
	const replayable = config?.data == null || typeof config.data === "string";
	if (error.response?.status === 429 && (read || replayable)) {
		const value = error.response.headers["retry-after"];
		const seconds = value === undefined ? undefined : Number(value);
		const delay =
			value === undefined
				? 1000 * 2 ** attempt
				: Number.isFinite(seconds)
					? seconds! * 1000
					: Date.parse(String(value)) - Date.now();
		// Never retry sooner than requested, or hold a CLI invocation indefinitely.
		return Number.isFinite(delay) && delay <= 30_000 ? Math.max(0, delay) : undefined;
	}
	if (
		read &&
		!error.response &&
		["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "ERR_NETWORK", "EAI_AGAIN"].includes(
			error.code ?? "",
		)
	)
		return 250 * 2 ** attempt;
	return undefined;
}
