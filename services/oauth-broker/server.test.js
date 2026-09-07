import { afterEach, expect, test, vi } from "@effect/vitest";
import { request as httpRequest } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { createOAuthBroker } from "./server.js";
const servers = [];
afterEach(async () => {
	await Promise.all(
		servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
	);
});
async function fixture() {
	let time = Date.now();
	const upstream = vi.fn(
		async (url) =>
			new Response(
				JSON.stringify(
					url.endsWith("accessible-resources")
						? [
								{
									id: "c3c16874-09be-4bda-9016-2fbd2e925d90",
									url: "https://test.atlassian.net",
									name: "Test",
									scopes: ["read:page:confluence"],
								},
							]
						: {
								access_token: "test-access",
								refresh_token: "test-refresh",
								expires_in: 3600,
							},
				),
			),
	);
	// A fixed public origin lets the ephemeral test listener exercise strict Host validation.
	const origin = "http://127.0.0.1:8767";
	const server = createOAuthBroker({
		clientId: "test-client",
		clientSecret: "test-secret",
		publicUrl: origin,
		fetchRequest: upstream,
		now: () => time,
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	servers.push(server);
	const actual = `http://127.0.0.1:${server.address().port}`;
	const call = (path, body, headers = {}) =>
		new Promise((resolve, reject) => {
			const req = httpRequest(
				actual + path,
				{
					method: body ? "POST" : "GET",
					headers: {
						host: new URL(origin).host,
						...(body ? { "Content-Type": "application/json" } : {}),
						...headers,
					},
				},
				(response) => {
					let data = "";
					response.on("data", (chunk) => {
						data += chunk;
					});
					response.on("end", () =>
						resolve(
							new Response(data, {
								status: response.statusCode,
								headers: response.headers,
							}),
						),
					);
				},
			);
			req.on("error", reject);
			req.end(body ? JSON.stringify(body) : undefined);
		});
	const start = async () => {
		const verifier = randomBytes(32).toString("base64url");
		const session = await (
			await call("/sessions", {
				challenge: createHash("sha256").update(verifier).digest("base64url"),
			})
		).json();
		const authorization = await call(
			new URL(session.verificationUrl).pathname + new URL(session.verificationUrl).search,
		);
		const location = new URL(authorization.headers.get("location"));
		return { id: session.id, verifier, location, state: location.searchParams.get("state") };
	};
	return {
		call,
		start,
		upstream,
		advance: () => {
			time += 300001;
		},
	};
}
test("authorization binds state, exchanges once and delivers tokens only to the initiating client", async () => {
	const { call, start, upstream } = await fixture();
	const session = await start();
	expect(session.location.origin).toBe("https://auth.atlassian.com");
	expect(session.location.searchParams.get("scope")).toContain("offline_access");
	expect(session.location.href).not.toContain("test-secret");
	expect(session.location.searchParams.get("code_challenge_method")).toBe("S256");
	expect((await call("/token", { id: session.id, verifier: "x".repeat(43) })).status).toBe(400);
	expect((await call("/token", session)).status).toBe(202);
	expect((await call("/callback?state=invalid&code=secret-code")).status).toBe(400);
	expect(upstream).not.toHaveBeenCalled();
	const callback = await call(`/callback?state=${session.state}&code=secret-code`);
	expect(callback.status).toBe(200);
	expect(await callback.text()).not.toContain("test-access");
	expect((await call(`/callback?state=${session.state}&code=secret-code`)).status).toBe(400);
	const tokens = await (await call("/token", session)).json();
	expect(tokens).toMatchObject({
		accessToken: "test-access",
		refreshToken: "test-refresh",
		sites: [{ name: "Test" }],
	});
	expect(JSON.parse(upstream.mock.calls[0][1].body)).toMatchObject({
		grant_type: "authorization_code",
		client_secret: "test-secret",
		redirect_uri: "http://127.0.0.1:8767/callback",
	});
	expect((await call("/token", session)).status).toBe(400);
	const verifier = JSON.parse(upstream.mock.calls[0][1].body).code_verifier;
	expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
		session.location.searchParams.get("code_challenge"),
	);
});
test("cancelled, denied and expired sessions never return tokens", async () => {
	const { call, start, upstream, advance } = await fixture();
	const cancelled = await start();
	await call("/cancel", cancelled);
	expect((await call(`/callback?state=${cancelled.state}&code=test`)).status).toBe(400);
	const denied = await start();
	await call(`/callback?state=${denied.state}&error=access_denied`);
	expect(await (await call("/token", denied)).json()).toEqual({ error: "access_denied" });
	const expired = await start();
	advance();
	expect((await call(`/callback?state=${expired.state}&code=test`)).status).toBe(400);
	expect(upstream).not.toHaveBeenCalled();
});
test("refresh uses the registered app and hides upstream failures", async () => {
	const { call, upstream } = await fixture();
	expect((await call("/refresh", { refreshToken: "old-refresh-token" })).status).toBe(200);
	expect(JSON.parse(upstream.mock.calls[0][1].body)).toMatchObject({
		grant_type: "refresh_token",
		refresh_token: "old-refresh-token",
	});
	upstream.mockResolvedValueOnce(new Response("private upstream details", { status: 400 }));
	expect(await (await call("/refresh", { refreshToken: "old-refresh-token" })).json()).toEqual({
		error: "reconnect_required",
	});
});
test("rejects cross-origin requests, spoofed hosts and non-JSON requests", async () => {
	const { call, upstream } = await fixture();
	expect(
		(
			await call(
				"/sessions",
				{ challenge: "x".repeat(43) },
				{ Origin: "https://attacker.example" },
			)
		).status,
	).toBe(403);
	expect((await call("/health", undefined, { host: "attacker.example" })).status).toBe(403);
	expect(
		(await call("/sessions", { challenge: "x".repeat(43) }, { "Content-Type": "text/plain" }))
			.status,
	).toBe(400);
	expect(upstream).not.toHaveBeenCalled();
});
test("requires HTTPS outside the loopback test service", () => {
	expect(() =>
		createOAuthBroker({
			clientId: "id",
			clientSecret: "secret",
			publicUrl: "http://example.com",
		}),
	).toThrow("HTTPS");
	expect(() =>
		createOAuthBroker({
			clientId: "id",
			clientSecret: "secret",
			publicUrl: "https://example.com/path",
		}),
	).toThrow("HTTPS");
});
