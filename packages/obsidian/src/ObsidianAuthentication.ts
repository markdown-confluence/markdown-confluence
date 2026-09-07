import {
	createAuthenticatedConfluenceClient,
	validateConfluenceSettings,
	type ConfluenceUploadSettings,
} from "@markdown-confluence/lib";
import { Effect } from "effect";
import { ObsidianConfluenceClient } from "./MyBaseClient";
import { desktopFetch } from "./desktopFetch";

/** Construct per publish so a vault left open never keeps an expired OAuth token. */
export async function createObsidianConfluenceClient(
	settings: ConfluenceUploadSettings.ConfluenceSettings,
	oauthAccessToken?: string,
) {
	const validation = validateConfluenceSettings(
		oauthAccessToken
			? { ...settings, confluenceAuthType: "bearer", atlassianApiToken: oauthAccessToken }
			: settings,
	);
	if (!validation.valid)
		throw new Error(validation.issues.map((issue) => issue.message).join("\n"));
	return Effect.runPromise(
		createAuthenticatedConfluenceClient(settings, {
			createClient: (config) => new ObsidianConfluenceClient(config),
			fetch: desktopFetch,
			...(oauthAccessToken ? { oauthAccessToken } : {}),
		}),
	);
}
