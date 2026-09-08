import { createHash, randomBytes } from "node:crypto";
import type { ConfluenceFetch } from "@markdown-confluence/lib";
import { desktopFetch } from "./desktopFetch";
import { oauthCallbackUrl, receiveOAuthCode } from "./OAuthCallback";

export interface OAuthSite {
	id: string;
	url: string;
	name: string;
}
export interface OAuthTokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}
export interface OAuthCredentials {
	clientId: string;
	clientSecret?: string | undefined;
}
export interface DeviceAuthorization {
	userCode: string;
	verificationUrl: string;
	expiresAt: number;
}
export const confluenceOAuthScopes = [
	"offline_access",
	"read:page:confluence",
	"write:page:confluence",
	"read:content.restriction:confluence",
	"write:content.restriction:confluence",
	"read:space:confluence",
	"read:content.metadata:confluence",
	"read:content-details:confluence",
	"read:attachment:confluence",
	"write:attachment:confluence",
	"read:label:confluence",
	"write:label:confluence",
	"read:confluence-user",
];
const authOrigin = "https://auth.atlassian.com";
const tokenUrl = `${authOrigin}/oauth/token`;
const random = () => randomBytes(32).toString("base64url");
const loginExpired = "Login expired. Please start again.";
class OAuthNetworkError extends Error {}

export function waitForOAuth(milliseconds: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const abort = () => {
			clearTimeout(timer);
			reject(new Error("Login cancelled"));
		};
		const timer = setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, milliseconds);
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true });
	});
}
export interface OAuthDependencies {
	fetch?: ConfluenceFetch;
	receiveCode?: typeof receiveOAuthCode;
	sleep?: typeof waitForOAuth;
	now?: () => number;
}
export class AtlassianOAuth {
	private readonly fetch: ConfluenceFetch;
	private readonly receiveCode: typeof receiveOAuthCode;
	private readonly sleep: typeof waitForOAuth;
	private readonly now: () => number;
	constructor(dependencies: OAuthDependencies = {}) {
		this.fetch = dependencies.fetch ?? desktopFetch;
		this.receiveCode = dependencies.receiveCode ?? receiveOAuthCode;
		this.sleep = dependencies.sleep ?? waitForOAuth;
		this.now = dependencies.now ?? Date.now;
	}
	private async request(url: string, init: RequestInit, signal?: AbortSignal) {
		let response;
		try {
			response = await this.fetch(url, {
				...init,
				redirect: "error",
				signal: signal
					? AbortSignal.any([signal, AbortSignal.timeout(20000)])
					: AbortSignal.timeout(20000),
			});
		} catch {
			if (signal?.aborted) throw new Error("Login cancelled");
			throw new OAuthNetworkError(
				"Cannot reach Atlassian. Check your connection and try again.",
			);
		}
		let data: Record<string, unknown>;
		try {
			data = await response.json();
		} catch {
			throw new Error("Atlassian returned an invalid login response. Please try again.");
		}
		if (!data || typeof data !== "object")
			throw new Error("Atlassian returned an invalid login response. Please try again.");
		return { status: response.status, data };
	}
	private credentials(credentials: OAuthCredentials) {
		return {
			client_id: credentials.clientId,
			...(credentials.clientSecret ? { client_secret: credentials.clientSecret } : {}),
		};
	}
	private error(data: Record<string, unknown>, device = false): Error {
		if (data["error"] === "access_denied")
			return new Error("Login was not approved in Atlassian. Please try again.");
		if (data["error"] === "expired_token") return new Error(loginExpired);
		if (
			device &&
			(data["error"] === "unauthorized_client" ||
				data["error"] === "unsupported_grant_type" ||
				(data["error"] === "invalid_client" &&
					String(data["error_description"]).includes("grant_type is not enabled")))
		) {
			return new Error(
				"Device-code login is not enabled for this OAuth app. Use browser login or ask Atlassian to enable the device authorization grant.",
			);
		}
		if (data["error"] === "invalid_client" || data["error"] === "unauthorized_client")
			return new Error(
				"Atlassian rejected the OAuth app credentials. Check the client ID and secret, and that this login method is enabled.",
			);
		if (data["error"] === "invalid_scope")
			return new Error(
				"The OAuth app is missing required Confluence scopes. Check its permissions in Atlassian.",
			);
		if (data["error"] === "invalid_grant")
			return new Error(
				"Session expired or authorization was rejected. Reconnect to Atlassian.",
			);
		return new Error("Atlassian could not complete login. Please try again.");
	}
	private tokens(data: Record<string, unknown>): OAuthTokens {
		if (
			typeof data["access_token"] !== "string" ||
			!data["access_token"] ||
			typeof data["refresh_token"] !== "string" ||
			!data["refresh_token"] ||
			typeof data["expires_in"] !== "number" ||
			!Number.isFinite(data["expires_in"]) ||
			data["expires_in"] <= 0 ||
			data["expires_in"] > 86400 ||
			typeof data["token_type"] !== "string" ||
			data["token_type"].toLowerCase() !== "bearer"
		)
			throw new Error(
				"Atlassian did not return usable access and refresh tokens. Check offline_access and reconnect.",
			);
		return {
			accessToken: data["access_token"],
			refreshToken: data["refresh_token"],
			expiresAt: this.now() + data["expires_in"] * 1000,
		};
	}
	private async exchange(
		credentials: OAuthCredentials,
		grant: Record<string, string>,
		signal?: AbortSignal,
	) {
		const response = await this.request(
			tokenUrl,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...this.credentials(credentials), ...grant }),
			},
			signal,
		);
		if (response.status !== 200) throw this.error(response.data);
		return this.tokens(response.data);
	}
	async browser(
		credentials: OAuthCredentials,
		callback: string,
		signal: AbortSignal,
		open: (url: string) => void,
	): Promise<OAuthTokens> {
		const callbackUrl = oauthCallbackUrl(callback).href;
		const state = random();
		const verifier = random();
		const authorization = new URL(`${authOrigin}/authorize`);
		authorization.search = new URLSearchParams({
			audience: "api.atlassian.com",
			client_id: credentials.clientId,
			scope: confluenceOAuthScopes.join(" "),
			redirect_uri: callbackUrl,
			state,
			response_type: "code",
			code_challenge: createHash("sha256").update(verifier).digest("base64url"),
			code_challenge_method: "S256",
			prompt: "consent",
		}).toString();
		const code = await this.receiveCode(callbackUrl, state, signal, () =>
			open(authorization.href),
		);
		return this.exchange(
			credentials,
			{
				grant_type: "authorization_code",
				code,
				code_verifier: verifier,
				redirect_uri: callbackUrl,
			},
			signal,
		);
	}
	async device(
		credentials: OAuthCredentials,
		signal: AbortSignal,
		show: (authorization: DeviceAuthorization) => void,
	): Promise<OAuthTokens> {
		const response = await this.request(
			`${authOrigin}/oauth/device/code`,
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					...this.credentials(credentials),
					audience: "api.atlassian.com",
					scope: confluenceOAuthScopes.join(" "),
				}).toString(),
			},
			signal,
		);
		if (response.status !== 200) throw this.error(response.data, true);
		const {
			device_code: deviceCode,
			user_code: userCode,
			expires_in: expiresIn,
			interval,
		} = response.data;
		if (
			typeof deviceCode !== "string" ||
			!deviceCode ||
			deviceCode.length > 16384 ||
			typeof userCode !== "string" ||
			!userCode ||
			userCode.length > 128 ||
			typeof expiresIn !== "number" ||
			!Number.isFinite(expiresIn) ||
			expiresIn <= 0 ||
			expiresIn > 86400 ||
			(interval !== undefined &&
				(typeof interval !== "number" || !Number.isFinite(interval) || interval <= 0))
		)
			throw new Error("Atlassian returned an invalid device login response.");
		const verification =
			response.data["verification_uri_complete"] ?? response.data["verification_uri"];
		if (typeof verification !== "string" || !URL.canParse(verification))
			throw new Error("Atlassian returned an invalid verification address.");
		const url = new URL(verification);
		if (
			url.protocol !== "https:" ||
			!["auth.atlassian.com", "id.atlassian.com"].includes(url.hostname) ||
			url.username ||
			url.password ||
			url.port ||
			url.hash
		)
			throw new Error("Atlassian returned an invalid verification address.");
		const expiresAt = this.now() + expiresIn * 1000;
		let delay = (typeof interval === "number" ? interval : 5) * 1000;
		show({ userCode, verificationUrl: url.href, expiresAt });
		while (!signal.aborted) {
			await this.sleep(Math.min(delay, Math.max(0, expiresAt - this.now())), signal);
			if (this.now() >= expiresAt) throw new Error(loginExpired);
			let poll;
			try {
				poll = await this.request(
					tokenUrl,
					{
						method: "POST",
						headers: { "Content-Type": "application/x-www-form-urlencoded" },
						body: new URLSearchParams({
							...this.credentials(credentials),
							grant_type: "urn:ietf:params:oauth:grant-type:device_code",
							device_code: deviceCode,
						}).toString(),
					},
					signal,
				);
			} catch (error) {
				if (!(error instanceof OAuthNetworkError)) throw error;
				delay *= 2;
				continue;
			}
			if (signal.aborted) throw new Error("Login cancelled");
			if (this.now() >= expiresAt) throw new Error(loginExpired);
			if (poll.status === 200) return this.tokens(poll.data);
			if (poll.status === 429 || poll.data["error"] === "slow_down") {
				delay += 5000;
				continue;
			}
			if (poll.data["error"] !== "authorization_pending") throw this.error(poll.data, true);
		}
		throw new Error("Login cancelled");
	}
	refresh(credentials: OAuthCredentials, refreshToken: string, signal?: AbortSignal) {
		return this.exchange(
			credentials,
			{ grant_type: "refresh_token", refresh_token: refreshToken },
			signal,
		);
	}
	async sites(accessToken: string, signal: AbortSignal): Promise<OAuthSite[]> {
		const response = await this.request(
			"https://api.atlassian.com/oauth/token/accessible-resources",
			{ headers: { Authorization: `Bearer ${accessToken}` } },
			signal,
		);
		if (response.status !== 200 || !Array.isArray(response.data))
			throw new Error("Could not load the Confluence sites approved during login.");
		const sites = response.data
			.filter((site) => {
				if (
					typeof site?.id !== "string" ||
					!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
						site.id,
					) ||
					typeof site.url !== "string" ||
					!URL.canParse(site.url) ||
					!Array.isArray(site.scopes) ||
					!site.scopes.includes("read:page:confluence")
				)
					return false;
				const url = new URL(site.url);
				return (
					url.protocol === "https:" &&
					url.hostname.endsWith(".atlassian.net") &&
					!url.username &&
					!url.password &&
					!url.port &&
					url.pathname === "/" &&
					!url.search &&
					!url.hash
				);
			})
			.map((site) => ({
				id: site.id as string,
				url: site.url as string,
				name: String(site.name || site.url),
			}));
		if (!sites.length)
			throw new Error(
				"No Confluence site was granted. Check the app's scopes and reconnect.",
			);
		return sites;
	}
}
