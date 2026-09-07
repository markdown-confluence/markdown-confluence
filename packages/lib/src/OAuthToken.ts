import { Effect } from "effect";

/**
 * Atlassian OAuth 2.0 token endpoint used for the client-credentials grant.
 */
export const ATLASSIAN_OAUTH_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

/**
 * Audience required by Atlassian for service-account access tokens.
 */
export const ATLASSIAN_OAUTH_AUDIENCE = "api.atlassian.com";

/**
 * Maximum time to wait for the Atlassian OAuth token endpoint before aborting,
 * so a stalled network path can't hang CLI startup indefinitely.
 */
const ATLASSIAN_OAUTH_TIMEOUT_MS = 15_000;

type OAuthTokenResponse = {
	access_token?: unknown;
};

/**
 * Exchanges an Atlassian service-account client ID and secret for a short-lived
 * OAuth 2.0 bearer access token using the client-credentials grant.
 *
 * The returned token is suitable for the `confluence.js` client via
 * `authentication: { oauth2: { accessToken } }`, which sends it as
 * `Authorization: Bearer <token>`.
 *
 * Note: the token is short-lived. Callers that hold it for the duration of a
 * long-running operation may need to re-fetch it if it expires; this function
 * performs a single exchange and does not refresh.
 */
export function fetchOAuthAccessToken(
	clientId: string,
	clientSecret: string,
): Effect.Effect<string, Error> {
	return Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () =>
				fetch(ATLASSIAN_OAUTH_TOKEN_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					signal: AbortSignal.timeout(ATLASSIAN_OAUTH_TIMEOUT_MS),
					body: JSON.stringify({
						grant_type: "client_credentials",
						client_id: clientId,
						client_secret: clientSecret,
						audience: ATLASSIAN_OAUTH_AUDIENCE,
					}),
				}),
			catch: (error) =>
				new Error(
					`Failed to reach the Atlassian OAuth token endpoint: ${getErrorMessage(error)}`,
				),
		});

		if (!response.ok) {
			const detail = yield* Effect.tryPromise({
				try: () => response.text(),
				catch: () => new Error(""),
			}).pipe(Effect.orElseSucceed(() => ""));

			return yield* Effect.fail(
				new Error(
					`Atlassian OAuth token request failed with status ${response.status} ${response.statusText}${
						detail ? `: ${detail}` : ""
					}`,
				),
			);
		}

		const payload = yield* Effect.tryPromise({
			try: () => response.json() as Promise<OAuthTokenResponse>,
			catch: (error) =>
				new Error(
					`Failed to parse the Atlassian OAuth token response: ${getErrorMessage(error)}`,
				),
		});

		if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
			return yield* Effect.fail(
				new Error("Atlassian OAuth token response did not include an access_token"),
			);
		}

		return payload.access_token;
	});
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
