# Version 6 release notes — draft

This candidate brings the CLI, publishing library, Obsidian plugin and container onto the same maintained runtime. Publication is still pending; version 5.5.2 remains the latest released version.

## Upgrade requirements

- The CLI requires Node.js 24.15.0 or newer. The container includes the required runtime and Chromium.
- Node packages expose ESM entry points. CommonJS integrations can use dynamic `import()`.
- The library's publisher and workspace APIs changed. Read the [migration guide](../../documentation/MIGRATING_TO_6.md) before upgrading custom integrations.
- Install Obsidian artifacts manually from the integration repository's release. Community-catalog reinstatement is tracked separately.

## Features

- Convert Markdown files or stdin to ADF with `cli to-adf`, without Confluence credentials.
- Publish optional PlantUML diagrams through an explicitly configured server, alongside the updated Mermaid renderer.
- Add page headers, footers and a fenced `toc` block; exclude configured code-block languages.
- Select notes by tags or folders, publish Markdown heading/block embeds, and retain the published page URL in frontmatter.
- Configure Bearer authentication, custom request headers and REST prefixes. The CLI/library also include OAuth client-credentials authentication with a Confluence v2 adapter.
- Preserve more Markdown formatting, callouts, tasks, dates, links, media dimensions and non-image attachments.

## Fixes

- Unchanged publishing preserves page versions, attachments and labels, including Confluence's normalized TOC, page-link and media representations.
- Folder notes and root pages map consistently into the publishing hierarchy. Ambiguous titles without explicit IDs fail validation.
- Publishing protects edits by another user by default and retries version conflicts after refreshing the current version.
- Desktop Mermaid rendering selects readable light/dark colors, refreshes styles and closes hidden windows after failures.
- “Publish Current File” is unavailable when no Markdown note is open. The token field masks its value.
- Mermaid uploads use the correct multipart transport. Large diagrams support a configurable Puppeteer protocol timeout.
- ARM64 containers use Debian Chromium. The container accepts CLI subcommands directly through its entry point.
- Published library bundles include the corrected image parser and Markdown link parser used by conversion.
- CLI errors return a failure status with redacted diagnostics. Obsidian publishing includes validation and a publish lock.

## Verification and known limits

The regression suite passes 181 tests. Packed npm consumers, real diagram rendering, Linux/Windows CI, and live Confluence plus built-CLI create/unchanged/update flows pass. See [verification evidence](VERIFICATION.md) for exact revisions and the remaining distribution checks.

Live OAuth service-account testing is still pending. Basic and Bearer configuration do not establish full Confluence Data Center compatibility. PlantUML is disabled by default and sends source to the server selected by the user. Automatic remote deletion, bidirectional synchronization and complete ADF coverage are outside this release. Resolved inline-comment cleanup and reports without sufficient reproduction evidence remain open.

Dependency audit metadata is not clean: the workspace retains three reported advisories, and a clean package consumer reports five. The parser patches, bundled runtime behavior and remaining transitive dependency paths are documented in the verification report; no findings are suppressed.
