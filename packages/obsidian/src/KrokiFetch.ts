import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

/** Desktop diagram transport avoids browser CORS and preserves binary image bytes. */
export async function krokiFetch(url: string, init: RequestInit) {
	const protocol = new URL(url).protocol;
	if (protocol !== "http:" && protocol !== "https:") throw new Error("Kroki requires HTTP(S)");
	return new Promise<Pick<Response, "ok" | "status" | "headers" | "arrayBuffer">>(
		(resolve, reject) => {
			const outgoing = (protocol === "https:" ? httpsRequest : httpRequest)(
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
						reject(new Error("Kroki redirects are not permitted"));
						return;
					}
					const chunks: Buffer[] = [];
					incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
					incoming.on("error", reject);
					incoming.on("end", () => {
						const bytes = Buffer.concat(chunks);
						const headers = new Headers();
						for (const [key, value] of Object.entries(incoming.headers))
							if (value !== undefined)
								headers.set(key, Array.isArray(value) ? value.join(", ") : value);
						resolve({
							ok: status >= 200 && status < 300,
							status,
							headers,
							arrayBuffer: async () => Uint8Array.from(bytes).buffer,
						});
					});
				},
			);
			outgoing.on("error", reject);
			outgoing.end(init.body);
		},
	);
}
