# Confluence Cloud with API-token authentication disabled

Use an Atlassian **service account OAuth 2.0 credential** with the CLI or publishing
Action. This uses a client ID and secret to obtain a short-lived Bearer token.
An interactive developer-console OAuth app requires a different authorization
flow and cannot be substituted for a service-account credential.

## Create the credential

In Atlassian Administration, create a service account, give it Confluence app
access, and grant it permission to view and publish pages and attachments in the
target space. It does not need app or organization administrator access.

Follow Atlassian's [service-account credential instructions](https://support.atlassian.com/user-management/docs/create-oauth-2-0-credential-for-service-accounts/).
Select these Confluence granular scopes:

- `read:page:confluence`
- `write:page:confluence`
- `read:space:confluence`
- `read:content.metadata:confluence`
- `read:content-details:confluence`
- `read:attachment:confluence`
- `write:attachment:confluence`
- `read:label:confluence`
- `write:label:confluence`

The publisher uses v2 for pages and metadata and v1 for the current user,
attachment uploads and label writes. Both scopes and the account's space
permissions must allow these operations.

Store the client ID and secret as `ATLASSIAN_CLIENT_ID` and
`ATLASSIAN_CLIENT_SECRET` GitHub Actions secrets. Keep them out of Markdown and
checked-in configuration. Find your site's `cloudId` using the site URL followed
by `/_edge/tenant_info`.

## GitHub Action

```yaml
- uses: actions/checkout@v6
- uses: markdown-confluence/publish-action@v6
  with:
    confluenceAuthType: oauth2
    confluenceBaseUrl: https://api.atlassian.com/ex/confluence/YOUR_CLOUD_ID
    confluenceSiteUrl: https://your-site.atlassian.net
    confluenceParentId: '123456'
    atlassianClientId: ${{ secrets.ATLASSIAN_CLIENT_ID }}
    atlassianClientSecret: ${{ secrets.ATLASSIAN_CLIENT_SECRET }}
    contentRoot: .
    folderToPublish: docs
```

The API base must be the Atlassian gateway. The separate site URL supplies
browsable links in published pages. No username or API token is required.
Existing v6 action inputs support these settings; updating the publisher image
picks up subsequent transport fixes.

## CLI and library

For the CLI, set the equivalent environment variables:

```sh
export CONFLUENCE_AUTH_TYPE=oauth2
export CONFLUENCE_BASE_URL=https://api.atlassian.com/ex/confluence/YOUR_CLOUD_ID
export CONFLUENCE_SITE_URL=https://your-site.atlassian.net
export CONFLUENCE_PARENT_ID=123456
export CONFLUENCE_CONTENT_ROOT=.
export FOLDER_TO_PUBLISH=docs
# Inject ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET from your secret store.
npx @markdown-confluence/cli
```

Library settings use the same camel-case names as the Action inputs. Tokens are
obtained once per invocation and expire after 60 minutes; split longer runs.
The Obsidian settings interface currently supports Basic and Bearer credentials,
so this client-credentials setup applies to the CLI, Action and library.

## Verify the setup

Use the [live integration harness](TESTING.md#configure-live-testing-once) with
`CONFLUENCE_E2E_AUTH_TYPE=oauth2`. A successful exchange alone is insufficient:
the live test checks page creation, uploads, labels, unchanged publishing and
updates with the service account.
