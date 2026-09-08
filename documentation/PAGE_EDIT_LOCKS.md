# Restrict editing of published pages

Enable **Restrict editing to the publishing account** in Obsidian's Confluence settings, set `lockPublishedPages: true` in CLI configuration, pass `--lockPublishedPages`, or set `CONFLUENCE_LOCK_PUBLISHED_PAGES=true`.

Override the global setting on an individual note:

```yaml
connie-lock: true
```

Use `connie-lock: false` to stop managing that note's restrictions. Turning locking off does not unlock previously locked pages; remove edit restrictions explicitly in Confluence.

The publisher permits only its authenticated account to edit each published page. Existing viewing restrictions are preserved. It checks locks even when content is unchanged, and reports permission failures separately from content publishing. A failed change can leave a partially applied edit restriction; retry after resolving permissions. Content creation and restriction changes are separate requests, so this is not an atomic private-publication mechanism.

Use a dedicated publishing account if people should not manually edit these pages: anyone using that same account retains edit access. Administrators can change restrictions. Edit restrictions do not inherit to children, so each published page is managed individually. Generated hierarchy pages without a published source note are not covered by this setting.

The account needs permission to edit the page and manage restrictions. Scoped credentials need the content-restriction read/write scopes, plus the existing publishing scopes. OAuth classic scopes may cover these operations; granular scopes are `read:content.restriction:confluence` and `write:content.restriction:confluence`. Unscoped tokens still obey the account's permissions.

This uses the supported Cloud REST v1 content-restriction endpoints alongside v2 page APIs. It never replaces or deletes read restrictions.

After enabling this feature for OAuth, add the restriction scopes to your Atlassian OAuth app and reconnect if the existing grant lacks them. Existing scoped API tokens may need replacement with tokens that include the restriction scopes.

Run the dedicated live test with the existing integration settings/credential setup:

```sh
vp run test:integration edit-lock --settings-from /path/to/test-vault/.obsidian/plugins/confluence-integration/data.json
```

The test leaves a named fixture page in the dedicated test space and verifies locking, repeated locking, unchanged viewing restrictions and publisher updates. A second-user UI check is still needed to verify the reader experience end to end.
