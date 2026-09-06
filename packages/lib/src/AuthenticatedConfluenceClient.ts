import { Effect } from "effect";
import { Api, ConfluenceClient } from "confluence.js";
import { ConfluenceSettings } from "./Settings";
import { RequiredConfluenceClient } from "./ConfluenceClient";
import { createConfluenceClientConfig } from "./ConfluenceClientConfig";
import { ConfluenceV2Client } from "./ConfluenceV2Client";
import { fetchOAuthAccessToken } from "./OAuthToken";

/** Builds a publisher client while preserving the transport used for multipart uploads. */
export function createAuthenticatedConfluenceClient(
	settings: ConfluenceSettings,
): Effect.Effect<RequiredConfluenceClient, Error> {
	return Effect.gen(function* () {
		const oauth = settings.confluenceAuthType === "oauth2";
		const accessToken = oauth
			? yield* fetchOAuthAccessToken(
					settings.atlassianClientId,
					settings.atlassianClientSecret,
				)
			: settings.atlassianApiToken;
		const client = new ConfluenceClient(
			createConfluenceClientConfig({
				...settings,
				confluenceAuthType: oauth ? "bearer" : settings.confluenceAuthType,
				atlassianApiToken: accessToken,
			}),
		);
		if (oauth) {
			const content = new ConfluenceV2Client(settings.confluenceBaseUrl, accessToken);
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
