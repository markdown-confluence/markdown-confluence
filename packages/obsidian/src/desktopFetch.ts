import { request } from "node:https";
import type { ConfluenceFetch } from "@markdown-confluence/lib";

/** Desktop HTTPS transport: bypass browser CORS, preserve aborts, never follow redirects. */
export const desktopFetch: ConfluenceFetch = async (url, init) => {
	if (new URL(url).protocol !== "https:") throw new Error("Confluence requests require HTTPS");
	// Request serializes native FormData, including its boundary, without corrupting binary files.
	const serialized = new Request(url, init);
	const body = init.body == null ? undefined : Buffer.from(await serialized.arrayBuffer());
	return new Promise((resolve, reject) => {
		const outgoing = request(
			url,
			{
				method: serialized.method,
				headers: Object.fromEntries(serialized.headers),
				signal: init.signal ?? undefined,
			},
			(incoming) => {
				const status = incoming.statusCode ?? 0;
				if (status >= 300 && status < 400) {
					incoming.destroy();
					reject(new Error("Confluence redirects are not permitted"));
					return;
				}
				const chunks: Buffer[] = [];
				incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
				incoming.on("error", reject);
				incoming.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					const headers = new Headers();
					for (const [key, value] of Object.entries(incoming.headers)) {
						if (value !== undefined)
							headers.set(key, Array.isArray(value) ? value.join(", ") : value);
					}
					resolve({
						ok: status >= 200 && status < 300,
						status,
						statusText: incoming.statusMessage ?? "",
						headers,
						text: async () => text,
						json: async () => JSON.parse(text),
					});
				});
			},
		);
		outgoing.on("error", reject);
		outgoing.end(body);
	});
};
