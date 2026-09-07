import { randomUUID } from "node:crypto";
import type { SecretStorage } from "obsidian";
import {
	AtlassianOAuth,
	type DeviceAuthorization,
	type OAuthDependencies,
	type OAuthSite,
	type OAuthTokens,
} from "./AtlassianOAuth";
import { oauthCallbackUrl } from "./OAuthCallback";

export interface BrowserOAuthSettings {
	oauthMode: "service-account" | "browser";
	oauthFlow: "authorization-code" | "device";
	oauthClientId: string;
	oauthClientSecretId: string;
	oauthCallbackUrl: string;
	oauthSecretId: string;
	oauthSites: OAuthSite[];
	oauthSiteId: string;
}
interface StoredTokens extends OAuthTokens {
	configuration: string;
}

/** Owns desktop browser/device login and rotating credentials for one vault. */
export class BrowserOAuth {
	private controller: AbortController | undefined;
	private refreshController: AbortController | undefined;
	private refreshing: Promise<string> | undefined;
	private generation = 0;
	private readonly client: AtlassianOAuth;
	private authorizationUrl = "";
	deviceAuthorization: DeviceAuthorization | undefined;
	status = "";
	constructor(
		private readonly settings: () => BrowserOAuthSettings,
		private readonly storage: () => SecretStorage | undefined,
		private readonly save: () => Promise<void>,
		private readonly openUrl: (url: string) => void,
		dependencies: OAuthDependencies = {},
	) {
		this.client = new AtlassianOAuth(dependencies);
	}
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
	get hasClientSecret() {
		return !!this.clientSecret();
	}
	private clientSecret() {
		const id = this.settings().oauthClientSecretId;
		return id ? this.storage()?.getSecret(id) || undefined : undefined;
	}
	async saveClientSecret(value: string) {
		if (this.pending || this.connected)
			throw new Error("Disconnect before changing OAuth app credentials.");
		const storage = this.requireStorage();
		if (!this.settings().oauthClientSecretId)
			this.settings().oauthClientSecretId = `confluence-oauth-client-${randomUUID()}`;
		storage.setSecret(this.settings().oauthClientSecretId, value.trim());
		await this.save();
	}
	private requireStorage() {
		const storage = this.storage();
		if (!storage)
			throw new Error("OAuth login requires Obsidian 1.11.4 or later with secret storage.");
		return storage;
	}
	private configuration() {
		const settings = this.settings();
		if (!settings.oauthClientId.trim())
			throw new Error("Enter the OAuth client ID before connecting.");
		if (!["authorization-code", "device"].includes(settings.oauthFlow))
			throw new Error("Choose a supported OAuth login method.");
		return JSON.stringify({
			client: settings.oauthClientId.trim(),
			secret: settings.oauthClientSecretId,
			flow: settings.oauthFlow,
			callback:
				settings.oauthFlow === "authorization-code"
					? oauthCallbackUrl(settings.oauthCallbackUrl).href
					: "",
		});
	}
	private read(): StoredTokens | undefined {
		const id = this.settings().oauthSecretId;
		const value = id && this.storage()?.getSecret(id);
		if (!value) return undefined;
		let parsed: StoredTokens;
		try {
			parsed = JSON.parse(value);
		} catch {
			throw new Error("Saved login is invalid. Reconnect to Atlassian.");
		}
		if (parsed.configuration !== this.configuration()) return undefined;
		if (
			typeof parsed.accessToken !== "string" ||
			!parsed.accessToken ||
			typeof parsed.refreshToken !== "string" ||
			!parsed.refreshToken ||
			!Number.isFinite(parsed.expiresAt)
		)
			throw new Error("Saved login is invalid. Reconnect to Atlassian.");
		return parsed;
	}
	private checkConnection(generation: number, configuration: string) {
		if (generation !== this.generation || configuration !== this.configuration())
			throw new Error("Connection changed. Please try again.");
	}
	private async store(tokens: OAuthTokens, configuration: string, generation: number) {
		const storage = this.requireStorage();
		if (!this.settings().oauthSecretId) {
			this.settings().oauthSecretId = `confluence-oauth-${randomUUID()}`;
			await this.save();
		}
		this.checkConnection(generation, configuration);
		storage.setSecret(
			this.settings().oauthSecretId,
			JSON.stringify({ ...tokens, configuration }),
		);
	}
	openBrowser() {
		if (this.pending && this.authorizationUrl) this.openUrl(this.authorizationUrl);
	}
	async connect(onChange: () => void = () => {}) {
		if (this.pending) return;
		this.requireStorage();
		const configuration = this.configuration();
		const credentials = {
			clientId: this.settings().oauthClientId.trim(),
			clientSecret: this.clientSecret(),
		};
		this.cancel();
		const controller = new AbortController();
		this.controller = controller;
		const generation = this.generation;
		this.status =
			this.settings().oauthFlow === "device"
				? "Requesting a device code…"
				: "Opening Atlassian login…";
		onChange();
		try {
			const showBrowser = (url: string) => {
				if (controller.signal.aborted) throw new Error("Login cancelled");
				this.authorizationUrl = url;
				this.status = this.deviceAuthorization
					? "Enter the code in your browser and approve access…"
					: "Waiting for approval in your browser…";
				onChange();
				this.openBrowser();
			};
			const tokens =
				this.settings().oauthFlow === "device"
					? await this.client.device(credentials, controller.signal, (device) => {
							this.deviceAuthorization = device;
							showBrowser(device.verificationUrl);
						})
					: await this.client.browser(
							credentials,
							this.settings().oauthCallbackUrl,
							controller.signal,
							showBrowser,
						);
			const sites = await this.client.sites(tokens.accessToken, controller.signal);
			this.checkConnection(generation, configuration);
			await this.store(tokens, configuration, generation);
			this.checkConnection(generation, configuration);
			this.settings().oauthSites = sites;
			this.settings().oauthSiteId =
				sites.find((site) => site.id === this.settings().oauthSiteId)?.id ?? sites[0]!.id;
			await this.save();
			this.checkConnection(generation, configuration);
			this.status = "Connected";
		} catch (error) {
			this.status = controller.signal.aborted
				? "Login cancelled"
				: error instanceof Error
					? error.message
					: "Login failed. Please try again.";
			throw new Error(this.status);
		} finally {
			if (this.controller === controller) {
				this.controller = undefined;
				this.authorizationUrl = "";
				this.deviceAuthorization = undefined;
			}
			onChange();
		}
	}
	cancel() {
		this.generation++;
		this.controller?.abort();
		this.refreshController?.abort();
		this.refreshing = undefined;
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
		const stored = this.read();
		if (!stored)
			throw new Error("Connect to Atlassian in Confluence settings before publishing.");
		if (stored.expiresAt > Date.now() + 120000) return stored.accessToken;
		if (this.refreshing) return this.refreshing;
		const generation = this.generation;
		const controller = new AbortController();
		this.refreshController = controller;
		const refreshing = (async () => {
			const tokens = await this.client.refresh(
				{
					clientId: this.settings().oauthClientId.trim(),
					clientSecret: this.clientSecret(),
				},
				stored.refreshToken,
				controller.signal,
			);
			await this.store(tokens, stored.configuration, generation);
			return tokens.accessToken;
		})();
		this.refreshing = refreshing;
		try {
			return await refreshing;
		} finally {
			if (this.refreshing === refreshing) this.refreshing = undefined;
			if (this.refreshController === controller) this.refreshController = undefined;
		}
	}
}
