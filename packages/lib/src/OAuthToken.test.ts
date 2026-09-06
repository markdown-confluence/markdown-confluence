import { afterEach, expect, test, vi } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { ATLASSIAN_OAUTH_TOKEN_URL, fetchOAuthAccessToken } from "./OAuthToken";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
	vi.restoreAllMocks();
});

test("returns the access token on a successful response", async () => {
	const fetchMock = vi.fn(
		async () =>
			new Response(JSON.stringify({ access_token: "token-123" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
	);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const token = await Effect.runPromise(fetchOAuthAccessToken("client-id", "client-secret"));

	expect(token).toBe("token-123");
	expect(fetchMock).toHaveBeenCalledTimes(1);
	const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
	expect(url).toBe(ATLASSIAN_OAUTH_TOKEN_URL);
	expect(init.method).toBe("POST");
	expect(init.signal).toBeInstanceOf(AbortSignal);
	const body = JSON.parse(String(init.body));
	expect(body).toMatchObject({
		grant_type: "client_credentials",
		client_id: "client-id",
		client_secret: "client-secret",
		audience: "api.atlassian.com",
	});
});

test("fails with a clear message on a non-2xx response", async () => {
	globalThis.fetch = vi.fn(
		async () => new Response("invalid_client", { status: 401, statusText: "Unauthorized" }),
	) as unknown as typeof fetch;

	const exit = await Effect.runPromiseExit(fetchOAuthAccessToken("client-id", "bad-secret"));

	expect(Exit.isFailure(exit)).toBe(true);
	const message = Exit.isFailure(exit) ? String(exit.cause) : "";
	expect(message).toContain("401");
	expect(message).toContain("invalid_client");
});

test("fails with a clear message on a network error", async () => {
	globalThis.fetch = vi.fn(async () => {
		throw new Error("connection refused");
	}) as unknown as typeof fetch;

	const exit = await Effect.runPromiseExit(fetchOAuthAccessToken("client-id", "client-secret"));

	expect(Exit.isFailure(exit)).toBe(true);
	const message = Exit.isFailure(exit) ? String(exit.cause) : "";
	expect(message).toContain("Failed to reach the Atlassian OAuth token endpoint");
	expect(message).toContain("connection refused");
});

test("fails when the response is missing an access token", async () => {
	globalThis.fetch = vi.fn(
		async () =>
			new Response(JSON.stringify({ token_type: "Bearer" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
	) as unknown as typeof fetch;

	const exit = await Effect.runPromiseExit(fetchOAuthAccessToken("client-id", "client-secret"));

	expect(Exit.isFailure(exit)).toBe(true);
	const message = Exit.isFailure(exit) ? String(exit.cause) : "";
	expect(message).toContain("did not include an access_token");
});
