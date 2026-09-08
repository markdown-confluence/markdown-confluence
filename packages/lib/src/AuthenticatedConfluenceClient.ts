import { Effect } from "effect";
import { createV1Client } from "confluence.js";
import type { Client } from "confluence.js/core";
import type { ConfluenceFetch } from "./ConfluenceFetch";
import { ConfluenceSettings } from "./Settings";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { createConfluenceClientConfig } from "./ConfluenceClientConfig";
import { createConfluenceTransport } from "./ConfluenceTransport";
import { ConfluenceV2Client } from "./ConfluenceV2Client";
import { fetchOAuthAccessToken } from "./OAuthToken";
import { cancellableClient, registerPublishCancellation } from "./PublishCancellation";

/** All Cloud authentication modes use the same v2 publishing operations and transport. */
export function createAuthenticatedConfluenceClient(
	settings: ConfluenceSettings,
	options: { fetch?: ConfluenceFetch; oauthAccessToken?: string } = {},
): Effect.Effect<RequiredConfluenceClient, Error> {
	return Effect.gen(function* () {
		const oauth = settings.confluenceAuthType === "oauth2";
		if (
			!URL.canParse(settings.confluenceBaseUrl) ||
			new URL(settings.confluenceBaseUrl).protocol !== "https:"
		) {
			return yield* Effect.fail(
				new Error(
					oauth
						? "OAuth requires an HTTPS Confluence API base URL"
						: "Confluence Cloud requires an HTTPS API base URL",
				),
			);
		}
		const accessToken = oauth
			? (options.oauthAccessToken ??
				(yield* fetchOAuthAccessToken(
					settings.atlassianClientId,
					settings.atlassianClientSecret,
					options.fetch,
				)))
			: settings.atlassianApiToken;
		const config = createConfluenceClientConfig({
			...settings,
			confluenceAuthType: oauth ? "bearer" : settings.confluenceAuthType,
			atlassianApiToken: accessToken,
		});
		const transport = createConfluenceTransport(config, options.fetch);
		return assembleAuthenticatedClient(settings.confluenceBaseUrl, transport);
	});
}

function assembleAuthenticatedClient(baseUrl: string, transport: Client): RequiredConfluenceClient {
	const v1 = createV1Client(transport);
	const content = new ConfluenceV2Client(baseUrl, transport);
	return registerPublishCancellation<RequiredConfluenceClient>(
		{
			...transport,
			content,
			contentAttachments: { getAttachments: content.getAttachments.bind(content) },
			contentLabels: {
				...v1.contentLabels,
				getLabelsForContent: content.getLabelsForContent.bind(content),
			},
			users: {
				getCurrentUser: async () => {
					const user = await v1.users.getCurrentUser();
					if (!user.accountId)
						throw new Error("Confluence did not return the current account ID");
					return { ...user, accountId: user.accountId };
				},
			},
		},
		(signal) => assembleAuthenticatedClient(baseUrl, cancellableClient(transport, signal)),
	);
}
