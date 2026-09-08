# Integration testing

Use Node **24.15.0** and Vite+ (`vp`), with the repository's pinned pnpm version.
Install dependencies once with `vp install --frozen-lockfile`.

## Fast development loop

```sh
vp run test:integration
```

This builds all packages, validates the Obsidian release artifacts, imports the
built packages, renders a real Mermaid PNG in Chromium, and converts all
Markdown fixtures through the CLI. CLI output must match the library's ADF,
including Unicode and TOC macros. It also checks CommonJS dynamic import and a
nonzero CLI error exit. It does not publish anything or require Confluence credentials.

After a build, or while using the existing watch commands, reuse the artifacts:

```sh
vp run test:integration --skip-build
```

`--skip-build` deliberately trusts `dist`; it does not detect stale builds. The
default always builds first. Unit tests and static checks remain separate:
`vp test run`, `vp run check`, and `vp run fmt:check`.

## Choose the scope

| Command | What it exercises | Requirements |
| --- | --- | --- |
| `vp run test:integration` | Built library, CLI, real Chromium/Mermaid, artifact validation | Installed workspace dependencies |
| `vp run test:integration:packages` | All five actual npm tarballs installed in a fresh consumer, then the same runtime checks | npm registry access; pnpm/browser caches are reused |
| `vp run test:integration:live` | Live Confluence publish, unchanged republish, one-note update, built CLI, error recovery | Dedicated space and test credentials |
| `vp run test:integration blogs` | Live blog create/update, attachments, label add/remove, unchanged publishing and CLI ADF file export | Dedicated space with Blogs enabled and blog-create permission |
| `vp run test:integration:docker` | Local image build, container CLI conversion, unconfigured-publishing failure exit | Running Docker engine |
| `vp run test:integration regressions` | Container publishes 166 notes, 17 Mermaid diagrams and image path variants; unchanged republish and diagram failure recovery | Docker, dedicated space and test credentials |
| `vp run test:vault` | Create a synthetic Obsidian vault or refresh only its built plugin | Desktop Obsidian for opening the result |
| `vp run test:integration:obsidian` | Installed desktop plugin, Electron Mermaid, live publish, unchanged/update verification through the API | Prepared/open test vault, enabled plugin and Obsidian CLI |

All profiles accept `--skip-build`. Run `vp run test:integration --help` for options.
Successful and failed runs write timed `summary.json` and `summary.md` reports to
`reports/integration/<profile>-<timestamp>-<unique-id>/`. Live checks also record test page IDs.
Reports contain no credentials. Temporary npm consumers are automatically removed,
including after failure. No command publishes npm packages, tags, images, or releases.

The package profile overrides **every internal package**, including transitive
dependencies, to the local tarballs. This prevents an already published version
from masking a broken candidate. It installs only in a temporary directory, keeping
the repository lockfile unchanged. PlantUML uses a deterministic test transport in
the fast/package profiles; the live and desktop profiles use the real server.

## Configure live testing once

Copy `.env.integration.example` to `.env.integration` (Git ignores the latter).
Set an HTTPS origin, a parent page ID, and the expected space key. The example
already names the dedicated `MCRT20260907` space used for release verification.
The harness reads the parent's space before any publishing and refuses a mismatch.

Provide `ATLASSIAN_USERNAME` and `ATLASSIAN_API_TOKEN` through the environment or
the private local file. Alternatively set `CONFLUENCE_E2E_SETTINGS_FILE` to the
`data.json` in a **dedicated test vault**. This reuses its credentials without
copying the token into the repository or passing it as a command argument.
Environment values take precedence over settings-file values.

```sh
vp run test:integration live --skip-build
```

For Cloud OAuth, configure `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET` and
`CONFLUENCE_E2E_API_URL=https://api.atlassian.com/ex/confluence/YOUR_CLOUD_ID`, then run:

```sh
CONFLUENCE_E2E_AUTH_TYPE=oauth2 vp run test:integration live
```

`CONFLUENCE_E2E_BASE_URL` remains the browsable site origin. No Basic credential
is needed in OAuth mode. See [CLOUD_OAUTH.md](CLOUD_OAUTH.md) for account permissions
and scopes. The desktop/vault profiles also support service-account OAuth.
For interactive browser login and token storage, see [OBSIDIAN_OAUTH.md](OBSIDIAN_OAUTH.md).

Scoped API tokens use `CONFLUENCE_E2E_AUTH_TYPE=basic`, the account email and token,
and `CONFLUENCE_E2E_API_URL=https://api.atlassian.com/ex/confluence/CLOUD_ID`.
Keep `CONFLUENCE_E2E_BASE_URL` as the browsable site origin. This gateway setting
applies to live, container and desktop verification as well as vault setup.
Atlassian documents the required gateway and Basic authentication in its
[API-token guidance](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/).

The live harness copies synthetic fixtures into a temporary directory and prefixes
page titles per run. It verifies formatting, heading embeds, exclusions, folder
hierarchy, tags, images, files, Mermaid and PlantUML attachments. Repeated publishing
must preserve page versions, content, attachments and labels. It then verifies a
single-note update, built-CLI republishing, duplicate-title and missing-embed
rejection, recovery after an injected upload failure, and a real HTTP 409 conflict. A real inline comment must retain its ID, body, open
status, marker and original highlighted text after an edit elsewhere on the page.
The next unchanged publish must keep the page version unchanged.

### Existing inline comments

The live, desktop and container profiles create an actual inline comment on a
synthetic paragraph, change another paragraph, publish and read both the comment
and the page's ADF back from Confluence. The test rejects an orphaned or resolved
comment, a changed highlight and the unmapped-comment fallback.

By default the publishing account also creates/verifies the fixture comment.
If its credentials do not permit comment creation, configure a separate test
collaborator with `CONFLUENCE_E2E_COMMENTS_SETTINGS_FILE`, pointing to a private
plugin settings JSON for the same test site. Alternatively inject
`CONFLUENCE_E2E_COMMENTS_USERNAME` and `CONFLUENCE_E2E_COMMENTS_API_TOKEN`.
The latter defaults to the site origin; set `CONFLUENCE_E2E_COMMENTS_API_URL` to
the gateway when the commenter uses a scoped token. The comment account needs
comment read/write access and page access. Publishing continues to use the
selected credentials, which need no additional comment-write permission.

### Blog posts

Enable **Blogs** in the dedicated space's Features settings and grant the test
account permission to create blog posts. Page creation permission is separate.
Then run `vp run test:integration blogs --skip-build` for each authentication
profile. The built CLI publishes a `connie-content-type: blogpost` file, writes
its ID back to frontmatter, uploads an image, adds/removes labels, updates the
body, verifies unchanged versions, and exports the ADF to a file.

Local fixture copies are removed automatically. Remote test pages are deliberately
retained for inspection; their links are in the report. Runs add pages to the
dedicated space, so clear old test batches through Confluence when appropriate.

## Action regressions

```sh
vp run test:integration regressions
```

This uses the released `ghcr.io/markdown-confluence/publish:6.0.0` container with
the Action's user, mount, working directory and environment contract. To check a
local candidate, build it first:

```sh
vp run build
vp run -r build:docker
CONFLUENCE_E2E_IMAGE=markdown-confluence/markdown-confluence vp run test:integration regressions --skip-build
```

For fast iteration, use two notes while retaining every image variant and both
diagram failure/recovery checks:

```sh
CONFLUENCE_E2E_REGRESSION_SIZE=small CONFLUENCE_E2E_IMAGE=markdown-confluence/markdown-confluence vp run test:integration regressions --skip-build
```

The default full fixture contains 166 notes and 17 Mermaid diagrams. Image coverage includes
relative PNGs, SVG, spaces, URL-encoded spaces, parentheses, Unicode, wiki embeds
and a public remote URL. The test checks native media references and attachment
reuse, then verifies that an unchanged publish preserves all page and attachment
versions. It creates a real inline comment, edits another paragraph and verifies
comment preservation and a subsequent unchanged publish. It also requires invalid Mermaid syntax and an injected protocol
timeout to exit unsuccessfully, followed by successful recovery. Each container
invocation has a ten-minute limit. Remote pages stay inside a newly created test
parent, and the report provides an image page for visual inspection.

This exercises the container contract locally. The GitHub workflow runs the same
candidate container on Linux AMD64; it does not update companion Action tags.

## Obsidian: setup once, then one command

```sh
vp run test:vault
```

The default vault is `../markdown-confluence-integration-vault`; override it with
`--vault PATH` or `CONFLUENCE_E2E_VAULT`. Open that directory as a vault in Obsidian,
enable Confluence Integration, and enable **Settings → General → Command line
interface**. Use the current [official Obsidian CLI](https://obsidian.md/help/cli)
with a supported desktop installer. Set `OBSIDIAN_CLI` if its executable is not in PATH.

The setup command creates a marker identifying a disposable integration vault.
It refuses to modify an existing unmarked directory. Subsequent runs refresh
`main.js` and `manifest.json` while preserving notes, published IDs and settings.
New settings files receive restrictive file permissions. Existing credentials and
settings are never replaced by a refresh; edit them in Obsidian if needed.

```sh
vp run test:integration obsidian --skip-build
```

The desktop check targets the named vault, verifies its full path, reloads the
installed plugin, checks its destination, and awaits its real publishing method.
It verifies remote content, attachment versions, labels, hierarchy and selection;
publishes twice to check idempotency; updates one note; and restores the fixture.
An actual inline comment must remain attached to its original text throughout,
and publishing the restored note again must preserve the version.
It uses Obsidian's vault API for edits so the application's file events participate.
The desktop app must remain running. CLI failures, a disabled plugin, wrong vault,
or wrong destination fail the check rather than reporting a skipped success.

Interactive OAuth vaults also verify rotating refresh tokens, secret storage and
the device-code settings controls. The device UI uses a simulated authority; a
separate request reports the real app's device-grant availability. These isolated
checks preserve the existing login. See [Obsidian OAuth](OBSIDIAN_OAUTH.md).
While testing, the runner temporarily disables background timer throttling in the
test vault's renderer and restores it on completion or failure. This prevents
hidden windows from stalling login polling and Dataview indexing.

This checks the plugin runtime and upload adapter. Visual layout, command-palette
interaction, notices/modal appearance and a second-editor
permission boundary still need separate checks. The Docker profile is a local
container smoke test; it does not verify published multi-architecture images or
the companion GitHub Action release.

### Dataview desktop acceptance

Install and enable Dataview in the dedicated test vault, then add `--dataview`:

```sh
vp run test:integration obsidian --dataview
```

This also verifies native tables/lists/tasks, outgoing paper links, embedded note
context, preserved queries, unchanged versions, dependency-only updates and query
errors before remote updates. It restores modified source and plugin settings.
See [DATAVIEW.md](DATAVIEW.md) for setup, supported query forms and hook details.

## GitHub Actions

### Mutation testing

`vp run mutation` runs the complete library mutation scope locally. CI distributes
that same scope across eight jobs using `vp run mutation:shard -- 1` through `8`.
`vp run mutation:plan` shows the deterministic groups, balanced by source size from
tracked files and the include/exclude patterns in `stryker.config.mjs`.

The Vitest runner selects covering tests and related test files. Static mutations
and TypeScript checking remain enabled. Workspace tests inject their relative path
base so they can run in worker threads without changing the process directory.

The final `mutation` check requires all eight jobs to succeed. It verifies each
completion manifest against the expected source scope and mutant counts, combines
the reports, and applies the configured score threshold to the combined result.
The `mutation-report` artifact contains the combined HTML, JSON, and metrics;
individual `mutation-shard-*` artifacts retain the detailed reports. Incremental
caches are reused only for identical source, tests, tooling and configuration.

### Integration testing

Pull requests run package integration on Linux and the built CLI/Chromium check
on Windows. Both reuse the existing workflows and upload reports even on failure.
Release publication tests the packed npm artifacts before publishing them.

For live Confluence testing, add `run-confluence-e2e` to an internal PR, or run
**Confluence End-to-End Verification → Run workflow**. The workflow uses the same
`vp run test:integration live` command and repository secrets, serializes live runs,
and uploads reports. Manual runs can select `oauth2` authentication and the
`blogs` profile or `regressions` profile (which builds the candidate container). OAuth runs use
`ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` repository secrets. The workflow
uses the API-token account to seed/verify comments as an independent collaborator.
Fork pull requests cannot automatically run credentialed tests.

To add coverage for a feature, add a synthetic note to `test-fixtures/release-vault`
and a concrete assertion in `scripts/confluence-release-e2e.js`. Simple conversion
fixtures automatically enter the CLI parity check. Use unit tests for edge cases;
keep live assertions focused on behavior that depends on Confluence or Obsidian.

### Diagnosing a live failure

The post-conflict idempotency assertion remains strict and logs the synthetic
stored and requested ADF for diagnosis. This caught Confluence asynchronously
adding an internal `_parentId` to its table-of-contents macro. Comparison ignores
that server context while preserving authored TOC options and exported ADF; the
regression test and a subsequent live run verify the fix. CI reports identify
the failed step instead of retrying an extra publish to hide a version change.

### Conversion acceptance checks

The quick and packaged-consumer profiles also test both conversion CLI commands
with file input/output and stdin, an exact rich ADF round trip, readable export,
formatting and invalid JSON. The live profile exports a page by URL and ID,
round-trips its media IDs, and verifies its version remains unchanged. See
[CONVERSION.md](CONVERSION.md#acceptance-criteria) for the full acceptance criteria.

See [Cloud API verification](CLOUD_API_MIGRATION.md) for the current endpoint,
authentication and feature matrix, including the live device-grant limitation.
