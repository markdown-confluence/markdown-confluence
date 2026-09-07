import { createServer } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const scopes = [
	"offline_access",
	"read:page:confluence",
	"write:page:confluence",
	"read:space:confluence",
	"read:content.metadata:confluence",
	"read:content-details:confluence",
	"read:attachment:confluence",
	"write:attachment:confluence",
	"read:label:confluence",
	"write:label:confluence",
	"read:confluence-user",
];
const random = () => randomBytes(32).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest("base64url");
const lifetime = 5 * 60 * 1000;

/** One broker instance owns pending logins. Tokens are never logged or put in browser URLs. */
export function createOAuthBroker({
	clientId,
	clientSecret,
	publicUrl,
	fetchRequest = fetch,
	now = Date.now,
}) {
	const base = new URL(publicUrl);
	if (
		base.username ||
		base.password ||
		base.pathname !== "/" ||
		base.search ||
		base.hash ||
		(base.protocol !== "https:" &&
			!(base.protocol === "http:" && base.hostname === "127.0.0.1"))
	)
		throw new Error(
			"OAuth service requires an HTTPS origin, or HTTP on 127.0.0.1 for local testing",
		);
	if (!clientId || !clientSecret)
		throw new Error("Configure OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET");
	const sessions = new Map();
	const states = new Map();
	const requests = new Map();
	const remove = (id) => {
		const session = sessions.get(id);
		if (session) states.delete(session.state);
		sessions.delete(id);
	};
	const prune = () => {
		for (const [id, session] of sessions) if (session.expires <= now()) remove(id);
		for (const [key, value] of requests) if (value.until <= now()) requests.delete(key);
	};
	const json = (res, status, value) => {
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify(value));
	};
	const page = (res, status, message) => {
		res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
		res.end(
			`<!doctype html><html lang="en"><meta charset="utf-8"><title>Confluence login</title><body><main><h1>Markdown Confluence</h1><p>${message}</p><p>You can close this tab and return to Obsidian.</p></main></body></html>`,
		);
	};
	const readBody = async (req) => {
		if (req.headers["content-type"] !== "application/json") throw Error("json");
		let body = "";
		for await (const chunk of req) {
			body += chunk;
			if (body.length > 16384) throw Error("size");
		}
		const value = JSON.parse(body);
		if (!value || Array.isArray(value) || typeof value !== "object") throw Error("object");
		return value;
	};
	const token = async (grant) => {
		const response = await fetchRequest("https://auth.atlassian.com/oauth/token", {
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(15000),
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...grant }),
		});
		if (!response.ok) throw Error("token");
		const data = await response.json();
		if (
			typeof data.access_token !== "string" ||
			!data.access_token ||
			typeof data.refresh_token !== "string" ||
			!data.refresh_token ||
			!Number.isFinite(data.expires_in) ||
			data.expires_in <= 0
		)
			throw Error("token");
		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt: now() + data.expires_in * 1000,
		};
	};
	return createServer(async (req, res) => {
		res.setHeader("Cache-Control", "no-store");
		res.setHeader("Referrer-Policy", "no-referrer");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.setHeader(
			"Content-Security-Policy",
			"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
		);
		prune();
		try {
			// No browser cross-origin API access; native clients have no Origin header.
			if (req.headers.origin && req.headers.origin !== base.origin)
				return json(res, 403, { error: "origin_rejected" });
			if (req.headers.host !== base.host) return json(res, 403, { error: "host_rejected" });
			const url = new URL(req.url, base);
			if (req.method === "GET" && url.pathname === "/health")
				return json(res, 200, { ready: true });
			if (req.method === "POST") {
				const key = req.socket.remoteAddress;
				const limit = requests.get(key) ?? { count: 0, until: now() + 60000 };
				if (requests.size >= 10000 && !requests.has(key))
					return json(res, 429, { error: "busy" });
				requests.set(key, limit);
				if (++limit.count > 120) return json(res, 429, { error: "slow_down" });
				const body = await readBody(req);
				if (url.pathname === "/sessions") {
					if (typeof body.challenge !== "string" || !/^[\w-]{43}$/.test(body.challenge))
						return json(res, 400, { error: "invalid_challenge" });
					if (sessions.size >= 1000) return json(res, 503, { error: "busy" });
					const id = random();
					const state = random();
					sessions.set(id, {
						challenge: body.challenge,
						codeVerifier: random(),
						state,
						expires: now() + lifetime,
						status: "pending",
					});
					states.set(state, id);
					return json(res, 201, {
						id,
						verificationUrl: `${base.origin}/authorize?session=${id}`,
						expiresIn: 300,
					});
				}
				if (url.pathname === "/token" || url.pathname === "/cancel") {
					const session = sessions.get(body.id);
					if (
						!session ||
						typeof body.verifier !== "string" ||
						!/^[\w-]{43}$/.test(body.verifier) ||
						!timingSafeEqual(
							Buffer.from(hash(body.verifier)),
							Buffer.from(session.challenge),
						)
					)
						return json(res, 400, { error: "invalid_session" });
					if (url.pathname === "/cancel") {
						remove(body.id);
						return json(res, 200, { cancelled: true });
					}
					if (session.status === "pending" || session.status === "exchanging")
						return json(res, 202, { pending: true });
					remove(body.id);
					if (session.status === "denied")
						return json(res, 400, { error: "access_denied" });
					if (session.status !== "ready")
						return json(res, 400, { error: "login_failed" });
					return json(res, 200, session.result);
				}
				if (url.pathname === "/refresh") {
					if (
						typeof body.refreshToken !== "string" ||
						body.refreshToken.length < 10 ||
						body.refreshToken.length > 12000
					)
						return json(res, 400, { error: "invalid_refresh" });
					try {
						return json(
							res,
							200,
							await token({
								grant_type: "refresh_token",
								refresh_token: body.refreshToken,
							}),
						);
					} catch {
						return json(res, 401, { error: "reconnect_required" });
					}
				}
			}
			if (req.method === "GET" && url.pathname === "/authorize") {
				const session = sessions.get(url.searchParams.get("session"));
				if (!session || session.status !== "pending" || session.started)
					return page(
						res,
						400,
						"This login has expired or has already started. Start again in Obsidian.",
					);
				session.started = true;
				const authorization = new URL("https://auth.atlassian.com/authorize");
				authorization.search = new URLSearchParams({
					audience: "api.atlassian.com",
					client_id: clientId,
					scope: scopes.join(" "),
					redirect_uri: `${base.origin}/callback`,
					state: session.state,
					response_type: "code",
					code_challenge: hash(session.codeVerifier),
					code_challenge_method: "S256",
					prompt: "consent",
				}).toString();
				res.writeHead(302, { Location: authorization.href });
				return res.end();
			}
			if (req.method === "GET" && url.pathname === "/callback") {
				const state = url.searchParams.get("state");
				const id = states.get(state);
				const session = sessions.get(id);
				if (!session || !session.started || session.status !== "pending")
					return page(
						res,
						400,
						"This login is invalid or expired. Start again in Obsidian.",
					);
				states.delete(state);
				session.status = "exchanging";
				if (url.searchParams.has("error")) {
					session.status = "denied";
					return page(res, 200, "Login was cancelled. No connection was saved.");
				}
				const code = url.searchParams.get("code");
				if (!code || code.length > 8192) {
					session.status = "failed";
					return page(res, 400, "The login response was incomplete. Please try again.");
				}
				try {
					const tokens = await token({
						grant_type: "authorization_code",
						code_verifier: session.codeVerifier,
						code,
						redirect_uri: `${base.origin}/callback`,
					});
					const response = await fetchRequest(
						"https://api.atlassian.com/oauth/token/accessible-resources",
						{
							headers: { Authorization: `Bearer ${tokens.accessToken}` },
							redirect: "error",
							signal: AbortSignal.timeout(15000),
						},
					);
					if (!response.ok) throw Error("resources");
					const resources = await response.json();
					if (!Array.isArray(resources)) throw Error("resources");
					const sites = resources
						.filter(
							(site) =>
								typeof site.id === "string" &&
								/^[a-f0-9-]{36}$/.test(site.id) &&
								typeof site.url === "string" &&
								/^https:\/\/[^/]+\.atlassian\.net\/?$/.test(site.url) &&
								site.scopes?.includes("read:page:confluence"),
						)
						.map((site) => ({
							id: site.id,
							url: site.url,
							name: String(site.name || site.url),
						}));
					if (!sites.length) throw Error("sites");
					session.result = { ...tokens, sites };
					session.status = "ready";
					return page(
						res,
						200,
						"Login complete. Return to Obsidian to choose your Confluence site.",
					);
				} catch {
					session.status = "failed";
					return page(
						res,
						502,
						"Login could not be completed. Please try again in Obsidian.",
					);
				}
			}
			return json(res, 404, { error: "not_found" });
		} catch {
			if (!res.headersSent) json(res, 400, { error: "invalid_request" });
			else res.end();
		}
	});
}
