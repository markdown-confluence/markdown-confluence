import { createServer, request } from "node:http";
import { expect, test } from "@effect/vitest";
import { oauthCallbackUrl, receiveOAuthCode } from "./OAuthCallback";
import { AtlassianOAuth } from "./AtlassianOAuth";

async function unusedCallback() {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No callback port");
	await new Promise<void>((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return `http://127.0.0.1:${address.port}/callback`;
}
function get(url: string, headers: Record<string, string> = {}, method = "GET") {
	return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>(
		(resolve, reject) => {
			const outgoing = request(url, { headers, method, agent: false }, (incoming) => {
				let body = "";
				incoming.setEncoding("utf8");
				incoming.on("data", (chunk) => {
					body += chunk;
				});
				incoming.on("end", () =>
					resolve({ status: incoming.statusCode!, body, headers: incoming.headers }),
				);
				incoming.on("error", reject);
			});
			outgoing.on("error", reject);
			outgoing.end();
		},
	);
}
test("native callback validates state, host, origin, method and one-use completion over real HTTP", async () => {
	const callback = await unusedCallback();
	const controller = new AbortController();
	let ready!: () => void;
	const listening = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const pending = receiveOAuthCode(callback, "expected-state", controller.signal, ready);
	try {
		await listening;
		const correct = `${callback}?code=one-use-code&state=expected-state`;
		expect((await get(correct, { Host: "evil.example" })).status).toBe(403);
		expect((await get(correct, { Origin: "https://evil.example" })).status).toBe(403);
		expect((await get(correct, {}, "POST")).status).toBe(403);
		expect((await get(`${callback}?code=one-use-code&state=wrong`)).status).toBe(400);
		expect((await get(`${correct}&state=expected-state`)).status).toBe(400);
		expect((await get(`${callback}?state=expected-state`)).status).toBe(400);
		const result = await get(correct);
		expect(result.status).toBe(200);
		expect(result.headers["cache-control"]).toBe("no-store");
		expect(result.body).not.toContain("one-use-code");
		expect(await pending).toBe("one-use-code");
		await expect(get(correct)).rejects.toThrow();
	} finally {
		controller.abort();
		await pending.catch(() => {});
	}
});
test("browser authorization exchanges a real loopback callback and refreshes through the direct Atlassian transport", async () => {
	const callback = await unusedCallback();
	const controller = new AbortController();
	const calls: Array<{ url: string; body: Record<string, string> }> = [];
	let completion!: Promise<unknown>;
	const client = new AtlassianOAuth({
		fetch: async (url, init) => {
			calls.push({ url, body: JSON.parse(init.body as string) });
			const data = {
				access_token: "direct-access",
				refresh_token: "direct-refresh",
				expires_in: 3600,
				token_type: "Bearer",
			};
			return {
				ok: true,
				status: 200,
				statusText: "OK",
				text: async () => JSON.stringify(data),
				json: async () => data,
			};
		},
	});
	try {
		const tokens = await client.browser(
			{ clientId: "native-client", clientSecret: "own-secret" },
			callback,
			controller.signal,
			(url) => {
				const authorization = new URL(url);
				completion = get(
					`${authorization.searchParams.get("redirect_uri")}?code=local-code&state=${authorization.searchParams.get("state")}`,
				);
			},
		);
		await completion;
		await client.refresh(
			{ clientId: "native-client", clientSecret: "own-secret" },
			tokens.refreshToken,
		);
		expect(calls).toHaveLength(2);
		expect(calls[0]).toMatchObject({
			url: "https://auth.atlassian.com/oauth/token",
			body: {
				grant_type: "authorization_code",
				code: "local-code",
				redirect_uri: callback,
				client_secret: "own-secret",
			},
		});
		expect(calls[1]!.body).toMatchObject({
			grant_type: "refresh_token",
			refresh_token: "direct-refresh",
		});
	} finally {
		controller.abort();
	}
});
test.each(["cancel", "deny", "timeout"])(
	"callback listener is released after %s",
	async (action) => {
		const callback = await unusedCallback();
		const controller = new AbortController();
		let ready!: () => void;
		const listening = new Promise<void>((resolve) => {
			ready = resolve;
		});
		const pending = receiveOAuthCode(
			callback,
			"state",
			controller.signal,
			ready,
			action === "timeout" ? 50 : 5000,
		);
		const rejection = expect(pending).rejects.toThrow(
			action === "cancel"
				? "Login cancelled"
				: action === "deny"
					? "not approved"
					: "timed out",
		);
		await listening;
		if (action === "cancel") controller.abort();
		if (action === "deny")
			expect((await get(`${callback}?state=state&error=access_denied`)).status).toBe(200);
		await rejection;
		const next = new AbortController();
		const restarted = receiveOAuthCode(callback, "state", next.signal, () => next.abort());
		await expect(restarted).rejects.toThrow("Login cancelled");
	},
);
test("a busy callback port gives a useful error without opening the browser", async () => {
	const callback = await unusedCallback();
	const controller = new AbortController();
	let ready!: () => void;
	const listening = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const first = receiveOAuthCode(callback, "state", controller.signal, ready);
	const cancelled = expect(first).rejects.toThrow("Login cancelled");
	try {
		await listening;
		let opened = false;
		await expect(
			receiveOAuthCode(callback, "state", new AbortController().signal, () => {
				opened = true;
			}),
		).rejects.toThrow("callback port is unavailable");
		expect(opened).toBe(false);
	} finally {
		controller.abort();
		await cancelled;
	}
});
test("callback addresses must be explicit IPv4 loopback and contain no credentials or query", () => {
	expect(oauthCallbackUrl("http://127.0.0.1:8766/callback").port).toBe("8766");
	for (const url of [
		"http://localhost:8766/callback",
		"http://0.0.0.0:8766/callback",
		"https://example.com/callback",
		"http://127.0.0.1:0/callback",
		"http://127.0.0.1:8766/callback?token=secret",
		"http://user:pass@127.0.0.1:8766/callback",
	])
		expect(() => oauthCallbackUrl(url)).toThrow();
});
