import { Effect } from "effect";
import { Api, ConfluenceClient, type Config } from "confluence.js";
import type { ConfluenceFetch } from "./ConfluenceFetch";
import { ConfluenceSettings } from "./Settings";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { createConfluenceClientConfig } from "./ConfluenceClientConfig";
import { ConfluenceV2Client } from "./ConfluenceV2Client";
import { fetchOAuthAccessToken } from "./OAuthToken";

/** Builds a publisher client while preserving the transport used for multipart uploads. */
export function createAuthenticatedConfluenceClient(
	settings: ConfluenceSettings,
	options: {
		createClient?: (config: Config) => RequiredConfluenceClient;
		fetch?: ConfluenceFetch;
		/** Access token obtained by an external OAuth authorization flow. */
		oauthAccessToken?: string;
	} = {},
): Effect.Effect<RequiredConfluenceClient, Error> {
	return Effect.gen(function* () {
		const oauth = settings.confluenceAuthType === "oauth2";
		if (
			oauth &&
			(!URL.canParse(settings.confluenceBaseUrl) ||
				new URL(settings.confluenceBaseUrl).protocol !== "https:")
		) {
			return yield* Effect.fail(new Error("OAuth requires an HTTPS Confluence API base URL"));
		}
		const accessToken = oauth
			? (options.oauthAccessToken ??
				(yield* fetchOAuthAccessToken(
					settings.atlassianClientId,
					settings.atlassianClientSecret,
					options.fetch,
				)))
			: settings.atlassianApiToken;
		const client = (options.createClient ?? ((config) => new ConfluenceClient(config)))(
			createConfluenceClientConfig({
				...settings,
				confluenceAuthType: oauth ? "bearer" : settings.confluenceAuthType,
				atlassianApiToken: accessToken,
			}),
		);
		if (oauth) {
			const content = new ConfluenceV2Client(
				settings.confluenceBaseUrl,
				accessToken,
				settings.confluenceRequestHeaders,
				options.fetch,
			);
			client.content = content as unknown as Api.Content;
			client.contentAttachments.getAttachments = content.getAttachments.bind(
				content,
			) as Api.ContentAttachments["getAttachments"];
			client.contentLabels.getLabelsForContent = content.getLabelsForContent.bind(
				content,
			) as Api.ContentLabels["getLabelsForContent"];
		}
		return client;
	});
}
