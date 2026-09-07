import { Effect } from "effect";
import { createAuthenticatedConfluenceClient } from "./AuthenticatedConfluenceClient";
import { readAdfDocument } from "./AdfDocument";
import { resolveSiteUrl, validateConfluenceSettings, type ConfluenceSettings } from "./Settings";

export function resolveConfluencePageId(reference: string, siteUrl: string): string {
	if (/^\d+$/.test(reference)) return reference;
	let url: URL;
	try {
		url = new URL(reference);
	} catch {
		throw new Error("Expected a numeric Confluence page ID or a full page URL.");
	}
	if (url.origin !== new URL(siteUrl).origin || url.username || url.password) {
		throw new Error("The Confluence page URL must belong to the configured Confluence site.");
	}
	const pageId =
		url.pathname.match(/\/pages\/(\d+)(?:\/|$)/)?.[1] ??
		(url.pathname.endsWith("/viewpage.action") ? url.searchParams.get("pageId") : null) ??
		(url.pathname.endsWith("/overview") ? url.searchParams.get("homepageId") : null);
	if (!pageId || !/^\d+$/.test(pageId)) {
		throw new Error(
			"This URL does not contain a Confluence page ID. Use the full page URL or --page ID (short share links are not supported).",
		);
	}
	return pageId;
}

/** Read only: uses the configured client, never sends credentials to the input URL. */
export function fetchConfluencePageAdf(settings: ConfluenceSettings, reference: string) {
	return Effect.gen(function* () {
		const issues = validateConfluenceSettings(settings).issues.filter(
			(issue) =>
				!["confluenceParentId", "folderToPublish", "contentRoot"].includes(issue.field),
		);
		if (issues.length)
			return yield* Effect.fail(new Error(issues.map((issue) => issue.message).join("\n")));
		const id = yield* Effect.try({
			try: () => resolveConfluencePageId(reference, resolveSiteUrl(settings)),
			catch: toError,
		});
		const client = yield* createAuthenticatedConfluenceClient(settings);
		const page = yield* Effect.tryPromise({
			try: () => client.content.getContentById({ id, expand: ["body.atlas_doc_format"] }),
			catch: (error) => {
				const status =
					(error as { response?: { status?: number }; status?: number })?.response
						?.status ?? (error as { status?: number })?.status;
				return new Error(
					`Unable to read Confluence page ${id}${status ? ` (HTTP ${status})` : ""}. Check the configured site, authentication and page permissions.`,
				);
			},
		});
		return yield* Effect.try({ try: () => readAdfDocument(page), catch: toError });
	});
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
