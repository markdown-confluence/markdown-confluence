import {
	createAuthenticatedConfluenceClient,
	validateConfluenceSettings,
	type ConfluenceUploadSettings,
} from "@markdown-confluence/lib";
import { Effect } from "effect";
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
			fetch: desktopFetch,
			...(oauthAccessToken ? { oauthAccessToken } : {}),
		}),
	);
}
