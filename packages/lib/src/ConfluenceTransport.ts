import axios, { AxiosAdapter, AxiosError, type AxiosRequestConfig } from "axios";

/** Preserve useful errors across confluence.js's Axios error handler. */
export function createConfluenceTransport(
	adapter: AxiosAdapter = (config) => axios.getAdapter(axios.defaults.adapter)(config),
): AxiosAdapter {
	return async (config) => {
		for (let attempt = 0; ; attempt++) {
			if (config.signal?.aborted) throw new Error("Confluence request aborted");
			try {
				return await adapter(config);
			} catch (error) {
				if (config.signal?.aborted) throw new Error("Confluence request aborted");
				if (!axios.isAxiosError(error)) throw error;
				const delay = retryDelay(error, attempt);
				if (delay !== undefined) {
					await waitForRetry(delay, config.signal);
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

function waitForRetry(delay: number, signal: AxiosRequestConfig["signal"]): Promise<void> {
	return new Promise((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			signal?.removeEventListener?.("abort", abort);
			reject(new Error("Confluence request aborted"));
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener?.("abort", abort);
			resolve();
		}, delay);
		signal?.addEventListener?.("abort", abort, { once: true });
		if (signal?.aborted) abort();
	});
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
