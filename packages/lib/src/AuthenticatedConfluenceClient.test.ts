import { afterEach, expect, test, vi } from "@effect/vitest";
import { createServer } from "node:http";
import { Effect } from "effect";
import { createAuthenticatedConfluenceClient } from "./AuthenticatedConfluenceClient";
import { DEFAULT_SETTINGS, validateConfluenceSettings } from "./Settings";
import { ATLASSIAN_OAUTH_TOKEN_URL } from "./OAuthToken";
import { uploadBuffer } from "./Attachments";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("rejects an insecure OAuth destination before exchanging credentials", async () => {
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	const settings = {
		...DEFAULT_SETTINGS,
		confluenceAuthType: "oauth2" as const,
		confluenceBaseUrl: "http://example.atlassian.net",
		atlassianClientId: "client-id",
		atlassianClientSecret: "client-secret",
	};
	expect(validateConfluenceSettings(settings).issues).toContainEqual({
		field: "confluenceBaseUrl",
		message: "OAuth requires an HTTPS Confluence API base URL",
	});
	await expect(Effect.runPromise(createAuthenticatedConfluenceClient(settings))).rejects.toThrow(
		"OAuth requires an HTTPS Confluence API base URL",
	);
	expect(fetch).not.toHaveBeenCalled();
});

test.each(["oauth2", "basic"] as const)(
	"%s authenticates v2 page writes and multipart uploads through the Cloud gateway",
	async (authType) => {
		const expectedAuthorization =
			authType === "oauth2"
				? "Bearer short-lived-access-token"
				: `Basic ${Buffer.from("test@example.com:scoped-api-token").toString("base64")}`;
		const requests: {
			method: string;
			url: string;
			authorization: string | undefined;
			body: string;
		}[] = [];
		const server = createServer(async (request, response) => {
			let body = "";
			for await (const chunk of request) body += chunk;
			requests.push({
				method: request.method!,
				url: request.url!,
				authorization: request.headers.authorization,
				body,
			});
			response.setHeader("Content-Type", "application/json");
			if (request.headers.authorization !== expectedAuthorization) {
				response.writeHead(401).end(
					JSON.stringify({
						message: "Basic Authentication has been disabled on this instance",
					}),
				);
				return;
			}
			const url = new URL(request.url!, "http://localhost");
			let payload: unknown;
			if (url.pathname.endsWith("/api/user/current"))
				payload = { type: "known", accountId: "service-account" };
			else if (
				url.pathname.endsWith("/api/v2/pages/123") ||
				(request.method === "POST" && url.pathname.endsWith("/api/v2/pages"))
			)
				payload = {
					id: "123",
					spaceId: "456",
					title: "OAuth page",
					status: "current",
					body: {
						atlas_doc_format: { value: '{"type":"doc","version":1,"content":[]}' },
					},
					version: { number: 1, authorId: "service-account" },
				};
			else if (url.pathname.endsWith("/api/v2/spaces/456"))
				payload = { id: "456", key: "TEST" };
			else if (url.pathname.endsWith("/content/123/child/attachment"))
				payload = {
					results: [{ extensions: { fileId: "file-id" }, container: { id: "123" } }],
				};
			else {
				response.writeHead(404).end(JSON.stringify({ message: "Unexpected test request" }));
				return;
			}
			response.end(JSON.stringify(payload));
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("Missing test server port");
		const realFetch = globalThis.fetch;
		const apiOrigin = "https://api.atlassian.com";
		const localOrigin = `http://127.0.0.1:${address.port}`;
		// Route the configured HTTPS endpoint to the test server inside the test transports only.
		let exchanges = 0;
		vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
			if (input === ATLASSIAN_OAUTH_TOKEN_URL) {
				exchanges++;
				expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
					client_id: "client-id",
					client_secret: "client-secret",
					grant_type: "client_credentials",
				});
				return new Response(
					JSON.stringify({
						access_token: "short-lived-access-token",
						expires_in: 3600,
						token_type: "Bearer",
					}),
				);
			}
			return realFetch(String(input).replace(apiOrigin, localOrigin), init);
		});
		try {
			const client = await Effect.runPromise(
				createAuthenticatedConfluenceClient({
					...DEFAULT_SETTINGS,
					confluenceAuthType: authType,
					atlassianUserName: "test@example.com",
					atlassianApiToken: "scoped-api-token",
					atlassianClientId: "client-id",
					atlassianClientSecret: "client-secret",
					confluenceBaseUrl: `${apiOrigin}/ex/confluence/cloud-id`,
				}),
			);
			expect((await client.users.getCurrentUser()).accountId).toBe("service-account");
			const page = await client.content.getContentById({ id: "123" });
			expect(page.space?.key).toBe("TEST");
			expect(page.version?.by?.accountId).toBe("service-account");
			const body = {
				atlas_doc_format: {
					representation: "atlas_doc_format",
					value: '{"type":"doc","version":1,"content":[]}',
				},
			};
			expect(
				(
					await client.content.createContent({
						type: "page",
						title: "Created page",
						space: { key: "TEST" },
						ancestors: [{ id: "10" }],
						body,
					})
				).id,
			).toBe("123");
			await client.content.updateContent({
				id: "123",
				type: "page",
				title: "Updated page",
				version: { number: 2 },
				body,
			});
			const uploaded = await uploadBuffer(
				client,
				"123",
				"image.svg",
				Buffer.from('<svg width="20" height="10" xmlns="http://www.w3.org/2000/svg"/>'),
				{},
			);
			expect(uploaded?.id).toBe("file-id");
			expect(exchanges).toBe(authType === "oauth2" ? 1 : 0);
			expect(requests).toHaveLength(6);
			expect(
				requests.every((request) => request.authorization === expectedAuthorization),
			).toBe(true);
			expect(
				requests.every((request) => request.url.startsWith("/ex/confluence/cloud-id/")),
			).toBe(true);
			expect(requests.at(-1)?.body).toContain("image.svg");
			expect(
				requests
					.filter((request) => request.method !== "GET")
					.map(({ method, url }) => ({ method, url })),
			).toEqual([
				{ method: "POST", url: "/ex/confluence/cloud-id/wiki/api/v2/pages" },
				{ method: "PUT", url: "/ex/confluence/cloud-id/wiki/api/v2/pages/123" },
				{
					method: "PUT",
					url: "/ex/confluence/cloud-id/wiki/rest/api/content/123/child/attachment",
				},
			]);
			expect(requests.some((request) => request.body.includes("client-secret"))).toBe(false);
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	},
);
