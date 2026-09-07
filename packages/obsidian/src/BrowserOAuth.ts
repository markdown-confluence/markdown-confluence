import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SecretStorage } from "obsidian";
import { oauthServiceOrigin, requestOAuthBroker } from "./OAuthBrokerClient";

export interface OAuthSite {
	id: string;
	url: string;
	name: string;
}
export interface BrowserOAuthSettings {
	oauthMode: "service-account" | "browser";
	oauthServiceUrl: string;
	oauthSecretId: string;
	oauthSites: OAuthSite[];
	oauthSiteId: string;
}
interface Tokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}
interface StoredTokens extends Tokens {
	service: string;
}
const parseTokens = (data: unknown): Tokens => {
	const value = data as Tokens;
	if (
		!value ||
		typeof value.accessToken !== "string" ||
		!value.accessToken ||
		typeof value.refreshToken !== "string" ||
		!value.refreshToken ||
		!Number.isFinite(value.expiresAt)
	)
		throw new Error("Login service returned invalid credentials. Please reconnect.");
	return {
		accessToken: value.accessToken,
		refreshToken: value.refreshToken,
		expiresAt: value.expiresAt,
	};
};
export class BrowserOAuth {
	private controller: AbortController | undefined;
	private refreshing: Promise<string> | undefined;
	private generation = 0;
	status = "";
	constructor(
		private readonly settings: () => BrowserOAuthSettings,
		private readonly storage: () => SecretStorage | undefined,
		private readonly save: () => Promise<void>,
		private readonly openUrl: (url: string) => void,
		private readonly request = requestOAuthBroker,
	) {}
	get pending() {
		return !!this.controller;
	}
	get connected() {
		try {
			return !!this.read();
		} catch {
			return false;
		}
	}
	private read(): StoredTokens | undefined {
		const settings = this.settings();
		const value = settings.oauthSecretId && this.storage()?.getSecret(settings.oauthSecretId);
		if (!value) return undefined;
		const parsed = JSON.parse(value) as StoredTokens;
		if (parsed.service !== oauthServiceOrigin(settings.oauthServiceUrl)) return undefined;
		return { ...parseTokens(parsed), service: parsed.service };
	}
	private async store(tokens: Tokens, service: string, generation: number) {
		const storage = this.storage();
		if (!storage)
			throw new Error("Browser login requires Obsidian 1.11.4 or later with secret storage.");
		if (!this.settings().oauthSecretId) {
			this.settings().oauthSecretId = `confluence-oauth-${randomUUID()}`;
			await this.save();
		}
		if (generation !== this.generation)
			throw new Error("Connection changed. Please try again.");
		storage.setSecret(this.settings().oauthSecretId, JSON.stringify({ ...tokens, service }));
	}
	async connect(onChange: () => void = () => {}) {
		if (this.pending) return;
		if (!this.storage())
			throw new Error("Browser login requires Obsidian 1.11.4 or later with secret storage.");
		const service = oauthServiceOrigin(this.settings().oauthServiceUrl);
		const controller = new AbortController();
		this.controller = controller;
		const generation = ++this.generation;
		const verifier = randomBytes(32).toString("base64url");
		let id: string | undefined;
		this.status = "Opening Atlassian login…";
		onChange();
		try {
			const start = await this.request(
				service,
				"/sessions",
				{ challenge: createHash("sha256").update(verifier).digest("base64url") },
				controller.signal,
			);
			const session = start.data as { id: string; verificationUrl: string };
			if (start.status !== 201 || !/^[\w-]{43}$/.test(session?.id))
				throw new Error("Could not start login. Check the login service configuration.");
			id = session.id;
			const verification = new URL(session.verificationUrl);
			if (
				verification.origin !== service ||
				verification.pathname !== "/authorize" ||
				verification.searchParams.get("session") !== id
			)
				throw new Error("Login service returned an invalid browser address.");
			if (controller.signal.aborted) throw new Error("Login cancelled");
			this.openUrl(verification.href);
			this.status = "Waiting for approval in your browser…";
			onChange();
			const expires = Date.now() + 300000;
			while (Date.now() < expires) {
				if (controller.signal.aborted) throw new Error("Login cancelled");
				const response = await this.request(
					service,
					"/token",
					{ id, verifier },
					controller.signal,
				);
				if (response.status === 200) {
					const result = response.data as Tokens & { sites: OAuthSite[] };
					const tokens = parseTokens(result);
					if (
						!Array.isArray(result.sites) ||
						!result.sites.length ||
						result.sites.some(
							(site) =>
								!/^[a-f0-9-]{36}$/.test(site.id) ||
								!/^https:\/\/[^/]+\.atlassian\.net\/?$/.test(site.url) ||
								typeof site.name !== "string",
						)
					)
						throw new Error("No Confluence site was granted. Please reconnect.");
					if (
						controller.signal.aborted ||
						generation !== this.generation ||
						service !== oauthServiceOrigin(this.settings().oauthServiceUrl)
					)
						throw new Error("Login cancelled");
					await this.store(tokens, service, generation);
					this.settings().oauthSites = result.sites;
					this.settings().oauthSiteId =
						result.sites.find((site) => site.id === this.settings().oauthSiteId)?.id ??
						result.sites[0]!.id;
					await this.save();
					this.status = "Connected";
					return;
				}
				if (response.status !== 202)
					throw new Error(
						(response.data as { error?: string })?.error === "access_denied"
							? "Login cancelled in Atlassian. You can try again."
							: "Login expired or failed. Please try again.",
					);
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}
			throw new Error("Login timed out. Please try again.");
		} catch (error) {
			this.status = controller.signal.aborted
				? "Login cancelled"
				: error instanceof Error
					? error.message
					: "Login failed. Please try again.";
			throw new Error(this.status);
		} finally {
			if (id) await this.request(service, "/cancel", { id, verifier }).catch(() => {});
			if (this.controller === controller) this.controller = undefined;
			onChange();
		}
	}
	cancel() {
		this.generation++;
		this.controller?.abort();
	}
	async disconnect() {
		this.cancel();
		const settings = this.settings();
		if (settings.oauthSecretId) this.storage()?.setSecret(settings.oauthSecretId, "");
		settings.oauthSites = [];
		settings.oauthSiteId = "";
		this.status = "Disconnected";
		await this.save();
	}
	async accessToken(): Promise<string> {
		if (this.refreshing) return this.refreshing;
		const stored = this.read();
		if (!stored)
			throw new Error("Connect to Atlassian in Confluence settings before publishing.");
		if (stored.expiresAt > Date.now() + 120000) return stored.accessToken;
		const generation = this.generation;
		this.refreshing = (async () => {
			const response = await this.request(stored.service, "/refresh", {
				refreshToken: stored.refreshToken,
			});
			if (generation !== this.generation)
				throw new Error("Connection changed. Please try again.");
			if (response.status !== 200) {
				this.status = "Session expired. Reconnect to Atlassian.";
				throw new Error(this.status);
			}
			const tokens = parseTokens(response.data);
			await this.store(tokens, stored.service, generation);
			return tokens.accessToken;
		})();
		try {
			return await this.refreshing;
		} finally {
			this.refreshing = undefined;
		}
	}
}
