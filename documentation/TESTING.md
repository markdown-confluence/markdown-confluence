# Integration testing

Use Node **24.15.0** and Vite+ (`vp`), with the repository's pinned pnpm version.
Install dependencies once with `vp install --frozen-lockfile`.

## Fast development loop

```sh
vp run test:integration
```

This builds all packages, validates the Obsidian release artifacts, imports the
built packages, renders a real Mermaid PNG in Chromium, and converts all ten
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
| `vp run test:integration:docker` | Local image build, container CLI conversion, unconfigured-publishing failure exit | Running Docker engine |
| `vp run test:vault` | Create a synthetic Obsidian vault or refresh only its built plugin | Desktop Obsidian for opening the result |
| `vp run test:integration:obsidian` | Installed desktop plugin, Electron Mermaid, live publish, unchanged/update verification through the API | Prepared/open test vault, enabled plugin and Obsidian CLI |

All profiles accept `--skip-build`. Run `vp run test:integration --help` for options.
Successful and failed runs write timed `summary.json` and `summary.md` reports to
`reports/integration/<profile>-<timestamp>/`. Live checks also record test page IDs.
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

The live harness copies synthetic fixtures into a temporary directory and prefixes
page titles per run. It verifies formatting, heading embeds, exclusions, folder
hierarchy, tags, images, files, Mermaid and PlantUML attachments. Repeated publishing
must preserve page versions, content, attachments and labels. It then verifies a
single-note update, built-CLI republishing, duplicate-title and missing-embed
rejection, recovery after an injected upload failure, and a real HTTP 409 conflict.

Local fixture copies are removed automatically. Remote test pages are deliberately
retained for inspection; their links are in the report. Runs add pages to the
dedicated space, so clear old test batches through Confluence when appropriate.

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
It uses Obsidian's vault API for edits so the application's file events participate.
The desktop app must remain running. CLI failures, a disabled plugin, wrong vault,
or wrong destination fail the check rather than reporting a skipped success.

This checks the plugin runtime and upload adapter. Visual layout, command-palette
interaction, notices/modal appearance, live OAuth credentials and a second-editor
permission boundary still need separate checks. The Docker profile is a local
container smoke test; it does not verify published multi-architecture images or
the companion GitHub Action release.

## GitHub Actions

Pull requests run package integration on Linux and the built CLI/Chromium check
on Windows. Both reuse the existing workflows and upload reports even on failure.
Release publication tests the packed npm artifacts before publishing them.

For live Confluence testing, add `run-confluence-e2e` to an internal PR, or run
**Confluence End-to-End Verification → Run workflow**. The workflow uses the same
`vp run test:integration live` command and repository secrets, serializes live runs,
and uploads reports. Fork pull requests cannot automatically run credentialed tests.

To add coverage for a feature, add a synthetic note to `test-fixtures/release-vault`
and a concrete assertion in `scripts/confluence-release-e2e.js`. Simple conversion
fixtures automatically enter the CLI parity check. Use unit tests for edge cases;
keep live assertions focused on behavior that depends on Confluence or Obsidian.

### Diagnosing a live failure

The post-conflict idempotency assertion failed once during local validation, then
passed on two fresh runs. It remains strict: a failure logs the synthetic stored
and requested ADF for diagnosis, rather than retrying an extra publish to hide an
unexpected version update. Treat this as an observed intermittent behavior, not
a resolved product defect. CI reports identify the failed step.

### Conversion acceptance checks

The quick and packaged-consumer profiles also test both conversion CLI commands
with file input/output and stdin, an exact rich ADF round trip, readable export,
formatting and invalid JSON. The live profile exports a page by URL and ID,
round-trips its media IDs, and verifies its version remains unchanged. See
[CONVERSION.md](CONVERSION.md#acceptance-criteria) for the full acceptance criteria.
