import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

export function oauthCallbackUrl(value: string): URL {
	if (!URL.canParse(value)) throw new Error("Enter a valid loopback callback URL.");
	const url = new URL(value);
	if (
		url.protocol !== "http:" ||
		url.hostname !== "127.0.0.1" ||
		!url.port ||
		Number(url.port) < 1 ||
		url.pathname !== "/callback" ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	)
		throw new Error(
			"Use http://127.0.0.1:PORT/callback and register the same URL with Atlassian.",
		);
	return url;
}

/** A temporary IPv4 loopback listener; only a matching, single-use state can finish login. */
export function receiveOAuthCode(
	callback: string,
	state: string,
	signal: AbortSignal,
	onReady: () => void,
	lifetimeMs = 300000,
): Promise<string> {
	const base = oauthCallbackUrl(callback);
	return new Promise((resolve, reject) => {
		let consumed = false;
		let finished = false;
		const finish = (error?: Error, code?: string) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", abort);
			server.close();
			server.closeAllConnections();
			if (error) reject(error);
			else resolve(code!);
		};
		const abort = () => finish(new Error("Login cancelled"));
		const server = createServer({ maxHeaderSize: 16384 }, (request, response) => {
			const reply = (status: number, message: string, complete?: () => void) => {
				response.writeHead(status, {
					"Content-Type": "text/html; charset=utf-8",
					"Cache-Control": "no-store",
					"Referrer-Policy": "no-referrer",
					"Content-Security-Policy":
						"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
					"X-Content-Type-Options": "nosniff",
					Connection: "close",
				});
				response.end(
					`<!doctype html><html lang="en"><meta charset="utf-8"><title>Confluence login</title><body><h1>Markdown Confluence</h1><p>${message}</p><p>You can close this tab and return to Obsidian.</p></body></html>`,
					complete,
				);
			};
			if (
				request.method !== "GET" ||
				request.headers.host !== base.host ||
				(request.headers.origin && request.headers.origin !== base.origin)
			) {
				reply(403, "This request is not allowed.");
				return;
			}
			if (!URL.canParse(request.url ?? "/", base)) {
				reply(400, "Invalid request.");
				return;
			}
			const url = new URL(request.url ?? "/", base);
			const receivedState = url.searchParams.getAll("state");
			if (
				url.origin !== base.origin ||
				url.pathname !== base.pathname ||
				consumed ||
				receivedState.length !== 1 ||
				Buffer.byteLength(receivedState[0]!) !== Buffer.byteLength(state) ||
				!timingSafeEqual(Buffer.from(receivedState[0]!), Buffer.from(state))
			) {
				reply(
					400,
					"This login response is invalid. Continue the login started in Obsidian.",
				);
				return;
			}
			const codes = url.searchParams.getAll("code");
			if (url.searchParams.has("error")) {
				consumed = true;
				reply(200, "Login was not approved.", () =>
					finish(new Error("Login was not approved in Atlassian. Please try again.")),
				);
			} else if (codes.length !== 1 || !codes[0] || codes[0].length > 8192) {
				reply(400, "The login response is incomplete. Please try again.");
			} else {
				consumed = true;
				reply(200, "Authorization received. Return to Obsidian to finish connecting.", () =>
					finish(undefined, codes[0]),
				);
			}
		});
		server.requestTimeout = 10000;
		server.headersTimeout = 10000;
		const timer = setTimeout(
			() => finish(new Error("Login timed out. Please try again.")),
			lifetimeMs,
		);
		signal.addEventListener("abort", abort, { once: true });
		server.once("error", () =>
			finish(
				new Error(
					"The callback port is unavailable. Close the other login or choose another registered callback URL.",
				),
			),
		);
		if (signal.aborted) {
			abort();
			return;
		}
		server.listen(Number(base.port), "127.0.0.1", () => {
			if (finished) {
				server.close();
				return;
			}
			try {
				onReady();
			} catch {
				finish(new Error("Could not open your browser. Please try again."));
			}
		});
	});
}
