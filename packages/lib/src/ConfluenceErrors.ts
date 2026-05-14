export function createMissingSpaceKeyError(
	pageId: string,
	confluenceBaseUrl?: string,
): Error {
	const siteHint = confluenceBaseUrl ? ` on ${confluenceBaseUrl}` : "";
	return new Error(
		`Missing Space Key for Confluence page "${pageId}". Markdown Confluence reads the space key from Confluence page responses; there is no separate space-key setting. Verify the page ID points to an existing page this Atlassian user can read${siteHint}, and for Confluence Cloud set confluenceBaseUrl to the Atlassian site URL without /wiki.`,
	);
}
