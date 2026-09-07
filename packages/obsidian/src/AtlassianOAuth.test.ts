import { expect, test, vi } from "@effect/vitest";
import { AtlassianOAuth, waitForOAuth } from "./AtlassianOAuth";
const respond = (data: unknown, status = 200) => ({
	ok: status === 200,
	status,
	statusText: "",
	text: async () => JSON.stringify(data),
	json: async () => data,
});
const authorized = {
	access_token: "access",
	refresh_token: "refresh",
	token_type: "Bearer",
	expires_in: 3600,
};
const device = {
	device_code: "device-secret",
	user_code: "ABCD-EFGH",
	verification_uri: "https://auth.atlassian.com/activate",
	expires_in: 600,
};
function fixture() {
	let now = 10000;
	const fetch = vi.fn(async (_url: string, _init: RequestInit) => respond(authorized));
	fetch.mockResolvedValueOnce(respond(device));
	const sleep = vi.fn(async (duration: number, signal: AbortSignal) => {
		signal.throwIfAborted();
		now += duration;
	});
	const client = new AtlassianOAuth({ fetch, sleep, now: () => now });
	const controller = new AbortController();
	const show = vi.fn();
	return { client, fetch, sleep, controller, show };
}
test("device polling observes the default interval, pending, permanent slowdown and network backoff", async () => {
	const { client, fetch, sleep, controller, show } = fixture();
	fetch
		.mockResolvedValueOnce(respond({ error: "authorization_pending" }, 400))
		.mockResolvedValueOnce(respond({ error: "slow_down" }, 400))
		.mockRejectedValueOnce(new Error("network containing device-secret"))
		.mockResolvedValueOnce(respond(authorized));
	await expect(
		client.device({ clientId: "client" }, controller.signal, show),
	).resolves.toMatchObject({ accessToken: "access" });
	expect(sleep.mock.calls.map((call) => call[0])).toEqual([5000, 5000, 10000, 20000]);
	expect(show).toHaveBeenCalledWith({
		userCode: "ABCD-EFGH",
		verificationUrl: device.verification_uri,
		expiresAt: 610000,
	});
	const requests = fetch.mock.calls.map(([url, init]) => ({
		url,
		body: Object.fromEntries(new URLSearchParams(init.body as string)),
	}));
	expect(requests[0]).toMatchObject({
		url: "https://auth.atlassian.com/oauth/device/code",
		body: { client_id: "client", audience: "api.atlassian.com" },
	});
	for (const request of requests) expect(request.body).not.toHaveProperty("client_secret");
	expect(requests[1]!.body).toMatchObject({
		grant_type: "urn:ietf:params:oauth:grant-type:device_code",
		device_code: "device-secret",
	});
});
test.each([
	["access_denied", "not approved"],
	["expired_token", "Login expired"],
	["invalid_scope", "missing required Confluence scopes"],
])("device polling stops on %s", async (error, message) => {
	const { client, fetch, controller, show } = fixture();
	fetch.mockResolvedValueOnce(
		respond({ error, error_description: "sensitive upstream detail" }, 400),
	);
	await expect(client.device({ clientId: "client" }, controller.signal, show)).rejects.toThrow(
		message,
	);
	expect(fetch).toHaveBeenCalledTimes(2);
});
test("disabled device grant provides an actionable message without opening a browser", async () => {
	const { client, fetch, controller, show } = fixture();
	fetch.mockReset().mockResolvedValue(
		respond(
			{
				error: "invalid_client",
				error_description: "grant_type is not enabled for client",
			},
			400,
		),
	);
	await expect(client.device({ clientId: "client" }, controller.signal, show)).rejects.toThrow(
		"Device-code login is not enabled",
	);
	expect(show).not.toHaveBeenCalled();
});
test("device expiry stops polling locally even if Atlassian keeps returning pending", async () => {
	const { client, fetch, controller, show, sleep } = fixture();
	fetch
		.mockReset()
		.mockResolvedValueOnce(respond({ ...device, expires_in: 11, interval: 4 }))
		.mockResolvedValue(respond({ error: "authorization_pending" }, 400));
	await expect(client.device({ clientId: "client" }, controller.signal, show)).rejects.toThrow(
		"Login expired",
	);
	expect(sleep.mock.calls.map((call) => call[0])).toEqual([4000, 4000, 3000]);
	expect(fetch).toHaveBeenCalledTimes(3);
});
test("cancelling a device login stops polling immediately", async () => {
	const { client, fetch, controller } = fixture();
	await expect(
		client.device({ clientId: "client" }, controller.signal, () => controller.abort()),
	).rejects.toThrow("Login cancelled");
	expect(fetch).toHaveBeenCalledTimes(1);
});
test("the real polling wait releases its timer on cancellation", async () => {
	const controller = new AbortController();
	const pending = waitForOAuth(60000, controller.signal);
	const rejected = expect(pending).rejects.toThrow("Login cancelled");
	controller.abort();
	await rejected;
});
test.each([
	"https://evil.example/activate",
	"http://auth.atlassian.com/activate",
	"https://auth.atlassian.com@evil.example/activate",
	"https://user:password@id.atlassian.com/activate",
])("rejects untrusted verification URL %s", async (verification_uri) => {
	const { client, fetch, controller, show } = fixture();
	fetch.mockReset().mockResolvedValue(respond({ ...device, verification_uri }));
	await expect(client.device({ clientId: "client" }, controller.signal, show)).rejects.toThrow(
		"invalid verification address",
	);
	expect(show).not.toHaveBeenCalled();
});
test("honours HTTP throttling and accepts confidential device client authentication", async () => {
	const { client, fetch, controller, show, sleep } = fixture();
	fetch.mockResolvedValueOnce(respond({ error: "rate_limited" }, 429));
	await client.device(
		{ clientId: "client", clientSecret: "own-secret" },
		controller.signal,
		show,
	);
	expect(sleep.mock.calls.map((call) => call[0])).toEqual([5000, 10000]);
	for (const [, init] of fetch.mock.calls)
		expect(new URLSearchParams(init.body as string).get("client_secret")).toBe("own-secret");
});
test.each([
	{ ...authorized, refresh_token: undefined },
	{ ...authorized, token_type: "MAC" },
	{ ...authorized, expires_in: -1 },
])("rejects unusable token responses", async (data) => {
	const { client, fetch, controller, show } = fixture();
	fetch.mockResolvedValueOnce(respond(data));
	await expect(client.device({ clientId: "client" }, controller.signal, show)).rejects.toThrow(
		"usable access and refresh tokens",
	);
});
