import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export function oauthServiceOrigin(value: string): string {
	if (!URL.canParse(value)) throw new Error("Enter the login service address before connecting.");
	const url = new URL(value);
	if (
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash ||
		(url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "127.0.0.1"))
	)
		throw new Error("Use an HTTPS login service, or http://127.0.0.1:8766 for local testing.");
	return url.origin;
}

/** Native transport for the login service. HTTP is permitted only on IPv4 loopback. */
export function requestOAuthBroker(
	origin: string,
	route: string,
	body: object,
	signal?: AbortSignal,
): Promise<{ status: number; data: unknown }> {
	const url = new URL(route, oauthServiceOrigin(origin));
	const timeout = AbortSignal.timeout(20000);
	return new Promise((resolve, reject) => {
		const outgoing = (url.protocol === "https:" ? httpsRequest : httpRequest)(
			url,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
			},
			(incoming) => {
				const chunks: Buffer[] = [];
				let size = 0;
				incoming.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > 128 * 1024)
						incoming.destroy(new Error("Login service response was too large"));
					else chunks.push(chunk);
				});
				incoming.on("error", reject);
				incoming.on("end", () => {
					const status = incoming.statusCode ?? 0;
					if (status >= 300 && status < 400)
						return reject(new Error("Login service redirects are not permitted"));
					try {
						resolve({
							status,
							data: JSON.parse(Buffer.concat(chunks).toString("utf8")),
						});
					} catch {
						reject(new Error("Login service returned an invalid response"));
					}
				});
			},
		);
		outgoing.on("error", () =>
			reject(
				new Error(
					signal?.aborted
						? "Login cancelled"
						: "Cannot reach the login service. Check its address and try again.",
				),
			),
		);
		outgoing.end(JSON.stringify(body));
	});
}
