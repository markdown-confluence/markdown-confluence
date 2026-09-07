import { request } from "node:https";
import type { ConfluenceFetch } from "@markdown-confluence/lib";

/** Desktop HTTPS transport: bypass browser CORS, preserve aborts, never follow redirects. */
export const desktopFetch: ConfluenceFetch = (url, init) =>
	new Promise((resolve, reject) => {
		if (new URL(url).protocol !== "https:") {
			reject(new Error("Confluence OAuth requests require HTTPS"));
			return;
		}
		if (init.body != null && typeof init.body !== "string") {
			reject(new Error("Confluence OAuth transport requires a string request body"));
			return;
		}
		const outgoing = request(
			url,
			{
				method: init.method,
				headers: Object.fromEntries(new Headers(init.headers)),
				signal: init.signal ?? undefined,
			},
			(incoming) => {
				const status = incoming.statusCode ?? 0;
				if (status >= 300 && status < 400) {
					incoming.destroy();
					reject(new Error("Confluence OAuth redirects are not permitted"));
					return;
				}
				const chunks: Buffer[] = [];
				incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
				incoming.on("error", reject);
				incoming.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					resolve({
						ok: status >= 200 && status < 300,
						status,
						statusText: incoming.statusMessage ?? "",
						text: async () => text,
						json: async () => JSON.parse(text),
					});
				});
			},
		);
		outgoing.on("error", reject);
		outgoing.end(init.body ?? undefined);
	});
