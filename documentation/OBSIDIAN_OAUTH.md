# Obsidian OAuth

The plugin supports both Cloud service-account OAuth and interactive browser login.
API tokens and Data Center personal access tokens remain available.

## Service accounts

Choose **OAuth / Service account** in Confluence Integration settings. Enter the
client ID and secret issued in Atlassian Administration, the gateway API URL
`https://api.atlassian.com/ex/confluence/CLOUD_ID`, the browsable site URL, and the
parent page ID. See [Cloud OAuth](CLOUD_OAUTH.md) for scopes and account permissions.
The plugin requests an access token when publishing, rather than during startup
or each settings edit. Service-account secrets currently follow the existing
plugin credential settings storage; exclude the vault's plugin settings from
shared backups and source control.

## Browser login

Choose **OAuth / Browser login**, configure the login service, and click
**Connect to Atlassian**. Approve the requested site in your browser, return to
Obsidian, select the site, and enter your parent page ID. **Test connection** checks
parent-page access without publishing. A cancelled or expired login can be retried.

![Connected browser OAuth settings in the integration test vault](images/obsidian-oauth-connected.png)

Browser access and rotating refresh tokens use Obsidian's `SecretStorage` API
(requires Obsidian 1.11.4 or newer). Plugin `data.json` contains a secret identifier
and site selection, not those tokens. Refresh happens before publishing when
necessary. Concurrent refresh requests share one operation and the replacement
refresh token is saved immediately. Disconnect clears the saved tokens for this
vault; revoke the app under your Atlassian account's connected apps to remove the
remote grant too. Reconnect on a second device instead of sharing refresh tokens.

The current browser implementation uses authorization code grants through the
small service in `services/oauth-broker`. It keeps the registered app secret out
of the distributed plugin. No default public service has been deployed yet.
The service address cannot be edited while connected; disconnect first so a
refresh token cannot accidentally be sent to a different service.

Supplying an individual app's client ID and secret could technically support a
local browser flow without this service, but that mode is not implemented.
Atlassian's [current guidance](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/)
states that distributed integrations instructing customers to create individual
3LO apps do not comply with its requirements. Resolve this with Atlassian before
making individual app registration the public onboarding flow.

## Run the registered app locally

This section is for the integration's maintainer, not a requirement for each
plugin user. The registered Atlassian OAuth app must have:

- A callback URL of `http://127.0.0.1:8766/callback` for local testing.
- The Confluence scopes listed in `services/oauth-broker/server.js`. Request
  `offline_access` during authorization to obtain rotating refresh tokens.
- Resource-level access, restricting the grant to the site selected at consent.

Create an ignored `.env.oauth` file with restrictive permissions:

```dotenv
OAUTH_CLIENT_ID=registered-app-client-id
OAUTH_CLIENT_SECRET=registered-app-secret
OAUTH_PUBLIC_URL=http://127.0.0.1:8766
```

```sh
chmod 600 .env.oauth
vp run oauth:broker
```

Set the test vault's **Login service** to `http://127.0.0.1:8766` and use the normal
Connect button. Keep the service running for login and refresh. Publishing can
use an unexpired saved token without contacting the service.

For hosted deployment, use an HTTPS origin in `OAUTH_PUBLIC_URL`, register its
`/callback` URL, and supply credentials through the host's secret manager.
`PORT` defaults to 8766; `OAUTH_BIND` defaults to `127.0.0.1`. A container normally
sets `OAUTH_BIND=0.0.0.0` behind a TLS proxy. Preserve the public Host header and
redact callback query strings in proxy access logs. Pending sessions live in one
process for five minutes: use one instance or session affinity; restarting it
requires pending logins to start again. Apply edge rate limits when hosting behind
a proxy. Public distribution also needs the app's distribution settings and
privacy information configured in Atlassian's developer console.

The broker uses a random OAuth state, S256 PKCE at Atlassian, and a separate
verifier challenge for the
native client. The browser never receives access or refresh tokens. The plugin
polls the broker over POST; the matching verifier receives the token response
once. Callbacks, expired sessions, cancelled sessions and token delivery cannot
be replayed. This polling is not RFC 8628 device authorization.

## Device authorization investigation

On 2026-09-07, Atlassian's live OpenID discovery document advertised
`https://auth.atlassian.com/oauth/device/code` and S256 PKCE. A direct device
request with the newly registered app's client ID and Confluence scopes, without
a secret, returned HTTP 400:

```json
{"error":"invalid_client","error_description":"grant_type is not enabled for client"}
```

This establishes that device grant is disabled for this client; it does not
establish that Atlassian has no device endpoint or that other clients cannot use
it. A service-free release would require a public client registration enabled
for device authorization or PKCE, plus verified Confluence scopes and refresh.
Do not embed a shared client secret to simulate a public client.

References: [Atlassian 3LO](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/),
[OAuth discovery](https://auth.atlassian.com/.well-known/openid-configuration),
[native OAuth client authentication](https://www.rfc-editor.org/rfc/rfc8252.html#section-8.5).

## Repeat the integration tests

```sh
vp test run packages/obsidian/src/BrowserOAuth.test.ts services/oauth-broker/server.test.js
CONFLUENCE_E2E_AUTH_TYPE=oauth2 vp run test:integration obsidian --vault ../markdown-confluence-oauth-vault
```

The desktop harness preserves the vault's selected OAuth mode and browser login.
Its independent API verification uses the service-account credentials from
`.env.integration`; the actual publisher uses the selected vault authentication.
It also forces a saved browser token to expire and verifies real refresh-token
rotation without exposing credentials. It checks create, unchanged republish,
update and restore, with real Electron
Mermaid, PlantUML, images, attachments, labels and hierarchy. Use different fixture
titles for different publishing accounts so the overwrite protection remains
active. Initial browser consent is interactive; subsequent runs reuse and refresh
the stored login.
