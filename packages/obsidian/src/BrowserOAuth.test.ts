import { expect, test, vi } from "@effect/vitest";
import { BrowserOAuth, type BrowserOAuthSettings } from "./BrowserOAuth";
import { oauthServiceOrigin } from "./OAuthBrokerClient";
const site = {
	id: "c3c16874-09be-4bda-9016-2fbd2e925d90",
	url: "https://test.atlassian.net",
	name: "Test",
};
function fixture() {
	const settings: BrowserOAuthSettings = {
		oauthMode: "browser",
		oauthServiceUrl: "http://127.0.0.1:8766",
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
	const request = vi.fn(async (_origin: string, route: string) =>
		route === "/sessions"
			? {
					status: 201,
					data: {
						id: "x".repeat(43),
						verificationUrl: `http://127.0.0.1:8766/authorize?session=${"x".repeat(43)}`,
					},
				}
			: route === "/cancel"
				? { status: 200, data: {} }
				: {
						status: 200,
						data: {
							accessToken: "access",
							refreshToken: "refresh",
							expiresAt: Date.now() + 3600000,
							sites: [site],
						},
					},
	);
	const save = vi.fn(async () => {});
	const open = vi.fn();
	const auth = new BrowserOAuth(
		() => settings,
		() => storage,
		save,
		open,
		request,
	);
	return { auth, settings, secrets, request, open, storage };
}
test("browser login keeps credentials in secret storage and binds polling to a verifier", async () => {
	const { auth, settings, secrets, request, open } = fixture();
	await auth.connect();
	expect(auth.connected).toBe(true);
	expect(auth.pending).toBe(false);
	expect(settings.oauthSites).toEqual([site]);
	expect(JSON.stringify(settings)).not.toContain('"access"');
	expect(JSON.stringify(settings)).not.toContain('"refresh"');
	expect(secrets.get(settings.oauthSecretId)).toContain('"refresh"');
	expect(open).toHaveBeenCalledOnce();
	expect(request.mock.calls.find((call) => call[1] === "/token")?.[2]).toMatchObject({
		verifier: expect.stringMatching(/^[\w-]{43}$/),
	});
	await auth.disconnect();
	expect(auth.connected).toBe(false);
	expect(secrets.get(settings.oauthSecretId)).toBe("");
	await expect(auth.accessToken()).rejects.toThrow("Connect to Atlassian");
});
test("expired tokens refresh once for concurrent publishes and persist rotation", async () => {
	const { auth, settings, storage, request } = fixture();
	await auth.connect();
	const saved = JSON.parse(storage.getSecret(settings.oauthSecretId)!);
	saved.expiresAt = 0;
	storage.setSecret(settings.oauthSecretId, JSON.stringify(saved));
	request.mockResolvedValue({
		status: 200,
		data: {
			accessToken: "new-access",
			refreshToken: "new-refresh",
			expiresAt: Date.now() + 3600000,
		},
	});
	expect(await Promise.all([auth.accessToken(), auth.accessToken()])).toEqual([
		"new-access",
		"new-access",
	]);
	expect(request.mock.calls.filter((call) => call[1] === "/refresh")).toHaveLength(1);
	expect(JSON.parse(storage.getSecret(settings.oauthSecretId)!).refreshToken).toBe("new-refresh");
});
test("changing login services cannot send the old refresh token to the new host", async () => {
	const { auth, settings, request } = fixture();
	await auth.connect();
	settings.oauthServiceUrl = "https://different.example";
	request.mockClear();
	await expect(auth.accessToken()).rejects.toThrow("Connect to Atlassian");
	expect(request).not.toHaveBeenCalled();
});
test("disconnect during refresh cannot restore removed credentials", async () => {
	const { auth, settings, storage, request } = fixture();
	await auth.connect();
	const saved = JSON.parse(storage.getSecret(settings.oauthSecretId)!);
	saved.expiresAt = 0;
	storage.setSecret(settings.oauthSecretId, JSON.stringify(saved));
	let complete!: (value: Awaited<ReturnType<typeof request>>) => void;
	request.mockImplementation(
		() =>
			new Promise((resolve) => {
				complete = resolve;
			}),
	);
	const pending = auth.accessToken();
	const rejected = expect(pending).rejects.toThrow("Connection changed");
	await auth.disconnect();
	complete({
		status: 200,
		data: {
			accessToken: "late-access",
			refreshToken: "late-refresh",
			expiresAt: Date.now() + 3600000,
		},
	});
	await rejected;
	expect(auth.connected).toBe(false);
});
test("rejects redirected browser authorization outside the configured service", async () => {
	const { auth, request, open } = fixture();
	request.mockResolvedValueOnce({
		status: 201,
		data: { id: "x".repeat(43), verificationUrl: "https://attacker.example/authorize" },
	});
	await expect(auth.connect()).rejects.toThrow("invalid browser address");
	expect(open).not.toHaveBeenCalled();
});
test("only permits HTTPS services and the explicit local test address", () => {
	expect(oauthServiceOrigin("http://127.0.0.1:8766")).toBe("http://127.0.0.1:8766");
	for (const url of [
		"http://example.com",
		"http://localhost:8766",
		"https://user:pass@example.com",
		"https://example.com/path",
	])
		expect(() => oauthServiceOrigin(url)).toThrow();
});
