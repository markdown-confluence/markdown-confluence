import { createHash } from "node:crypto";
import { expect, test, vi } from "@effect/vitest";
import { BrowserOAuth, type BrowserOAuthSettings } from "./BrowserOAuth";
import type { OAuthDependencies } from "./AtlassianOAuth";
const site = {
	id: "c3c16874-09be-4bda-9016-2fbd2e925d90",
	url: "https://test.atlassian.net",
	name: "Test",
};
const tokenResponse = (access = "access", refresh = "refresh") => ({
	access_token: access,
	refresh_token: refresh,
	expires_in: 3600,
	token_type: "Bearer",
});
const response = (data: unknown, status = 200) => ({
	ok: status === 200,
	status,
	statusText: "",
	text: async () => JSON.stringify(data),
	json: async () => data,
});
function fixture(extra: OAuthDependencies = {}) {
	const settings: BrowserOAuthSettings = {
		oauthMode: "browser",
		oauthFlow: "authorization-code",
		oauthClientId: "our-client",
		oauthClientSecretId: "",
		oauthCallbackUrl: "http://127.0.0.1:8766/callback",
		oauthSecretId: "",
		oauthSites: [],
		oauthSiteId: "",
	};
	const secrets = new Map<string, string>();
	const storage = {
		getSecret: (id: string) => secrets.get(id) ?? null,
		setSecret: (id: string, value: string) => {
			secrets.set(id, value);
		},
		listSecrets: () => [...secrets.keys()],
	};
	const fetch = vi.fn(async (url: string, _init: RequestInit) =>
		response(
			url.endsWith("accessible-resources")
				? [{ ...site, scopes: ["read:page:confluence"] }]
				: tokenResponse(),
		),
	);
	const receiveCode = vi.fn(
		async (_callback: string, _state: string, _signal: AbortSignal, ready: () => void) => {
			ready();
			return "code";
		},
	);
	const save = vi.fn(async () => {});
	const open = vi.fn();
	const auth = new BrowserOAuth(
		() => settings,
		() => storage,
		save,
		open,
		{ fetch, receiveCode, ...extra },
	);
	return { auth, settings, secrets, fetch, open, storage, save, receiveCode };
}
test("browser login and refresh stay in the plugin with app secrets and tokens outside settings", async () => {
	const { auth, settings, secrets, fetch, open } = fixture();
	await auth.saveClientSecret("user-secret");
	await auth.connect();
	expect(auth.connected).toBe(true);
	expect(auth.pending).toBe(false);
	expect(settings.oauthSites).toEqual([site]);
	for (const secret of ["user-secret", '"access"', '"refresh"'])
		expect(JSON.stringify(settings)).not.toContain(secret);
	expect(secrets.get(settings.oauthClientSecretId)).toBe("user-secret");
	const authorization = new URL(open.mock.calls[0]![0]);
	expect(authorization.origin).toBe("https://auth.atlassian.com");
	expect(authorization.searchParams.get("client_secret")).toBeNull();
	expect(authorization.searchParams.get("scope")).toContain("offline_access");
	const exchange = JSON.parse(fetch.mock.calls[0]![1].body as string);
	expect(exchange).toMatchObject({
		client_id: "our-client",
		client_secret: "user-secret",
		grant_type: "authorization_code",
		code: "code",
		redirect_uri: settings.oauthCallbackUrl,
	});
	expect(createHash("sha256").update(exchange.code_verifier).digest("base64url")).toBe(
		authorization.searchParams.get("code_challenge"),
	);
	await expect(auth.saveClientSecret("new-secret")).rejects.toThrow("Disconnect");
	await auth.disconnect();
	expect(auth.connected).toBe(false);
	expect(secrets.get(settings.oauthSecretId)).toBe("");
	expect(auth.hasClientSecret).toBe(true);
	await auth.saveClientSecret("");
	expect(auth.hasClientSecret).toBe(false);
	await expect(auth.accessToken()).rejects.toThrow("Connect to Atlassian");
});
test("an approved public client sends no secret during authorization or refresh", async () => {
	const { auth, settings, storage, fetch } = fixture();
	await auth.connect();
	const saved = JSON.parse(storage.getSecret(settings.oauthSecretId)!);
	storage.setSecret(settings.oauthSecretId, JSON.stringify({ ...saved, expiresAt: 0 }));
	fetch.mockResolvedValue(response(tokenResponse("new-access", "new-refresh")));
	expect(await Promise.all([auth.accessToken(), auth.accessToken()])).toEqual([
		"new-access",
		"new-access",
	]);
	const exchanges = fetch.mock.calls
		.filter((call) => call[0].endsWith("/oauth/token"))
		.map((call) => JSON.parse(call[1].body as string));
	expect(exchanges).toHaveLength(2);
	for (const exchange of exchanges) expect(exchange).not.toHaveProperty("client_secret");
	expect(exchanges[1]).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh" });
	expect(JSON.parse(storage.getSecret(settings.oauthSecretId)!).refreshToken).toBe("new-refresh");
});
test.each(["oauthClientId", "oauthCallbackUrl", "oauthFlow"] as const)(
	"changing %s cannot reuse the previous login",
	async (field) => {
		const { auth, settings, fetch } = fixture();
		await auth.connect();
		Object.assign(settings, {
			[field]:
				field === "oauthFlow"
					? "device"
					: field === "oauthClientId"
						? "another-client"
						: "http://127.0.0.1:9999/callback",
		});
		fetch.mockClear();
		await expect(auth.accessToken()).rejects.toThrow("Connect to Atlassian");
		expect(fetch).not.toHaveBeenCalled();
	},
);
test("disconnect during refresh cannot restore removed credentials", async () => {
	const { auth, settings, storage, fetch } = fixture();
	await auth.connect();
	storage.setSecret(
		settings.oauthSecretId,
		JSON.stringify({ ...JSON.parse(storage.getSecret(settings.oauthSecretId)!), expiresAt: 0 }),
	);
	let complete!: (value: ReturnType<typeof response>) => void;
	fetch.mockImplementation(
		() =>
			new Promise((resolve) => {
				complete = resolve;
			}),
	);
	const pending = auth.accessToken();
	const rejected = expect(pending).rejects.toThrow("Connection changed");
	await auth.disconnect();
	complete(response(tokenResponse("late-access", "late-refresh")));
	await rejected;
	expect(auth.connected).toBe(false);
});
test("disconnect while first-login settings save is pending cannot restore tokens", async () => {
	const { auth, save, secrets } = fixture();
	let finishSave!: () => void;
	let saveStarted!: () => void;
	const saving = new Promise<void>((resolve) => {
		saveStarted = resolve;
	});
	save.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finishSave = resolve;
				saveStarted();
			}),
	);
	const connected = auth.connect();
	const rejected = expect(connected).rejects.toThrow("Login cancelled");
	await saving;
	await auth.disconnect();
	finishSave();
	await rejected;
	expect([...secrets.values()].filter(Boolean)).toEqual([]);
});
test("cancelling browser login clears pending UI state without retaining credentials", async () => {
	const { auth, open, secrets } = fixture({
		receiveCode: async (_callback, _state, signal, ready) => {
			ready();
			return new Promise((_resolve, reject) =>
				signal.addEventListener("abort", () => reject(new Error("cancelled")), {
					once: true,
				}),
			);
		},
	});
	const pending = auth.connect();
	const rejected = expect(pending).rejects.toThrow("Login cancelled");
	expect(open).toHaveBeenCalledOnce();
	expect(auth.pending).toBe(true);
	auth.cancel();
	await rejected;
	expect(auth.pending).toBe(false);
	expect(auth.deviceAuthorization).toBeUndefined();
	expect(secrets.size).toBe(0);
});
test("device login populates sites and persists a refreshable login through the same vault manager", async () => {
	let now = Date.now();
	const { auth, settings, fetch, open, storage } = fixture({
		now: () => now,
		sleep: async (duration) => {
			now += duration;
		},
	});
	settings.oauthFlow = "device";
	fetch.mockResolvedValueOnce(
		response({
			device_code: "device-token",
			user_code: "ABCD-EFGH",
			verification_uri: "https://auth.atlassian.com/activate",
			expires_in: 600,
		}),
	);
	let displayedCode = "";
	await auth.connect(() => {
		if (auth.deviceAuthorization) displayedCode = auth.deviceAuthorization.userCode;
	});
	expect(displayedCode).toBe("ABCD-EFGH");
	expect(open).toHaveBeenCalledWith("https://auth.atlassian.com/activate");
	expect(settings.oauthSites).toEqual([site]);
	expect(auth.connected).toBe(true);
	expect(auth.deviceAuthorization).toBeUndefined();
	expect(storage.getSecret(settings.oauthSecretId)).toContain('"refresh"');
});
test("no Confluence grant never saves an apparently connected session", async () => {
	const { auth, fetch, secrets } = fixture();
	fetch
		.mockResolvedValueOnce(response(tokenResponse()))
		.mockResolvedValueOnce(response([{ ...site, scopes: ["read:jira-work"] }]));
	await expect(auth.connect()).rejects.toThrow("No Confluence site");
	expect(auth.connected).toBe(false);
	expect(secrets.size).toBe(0);
});
