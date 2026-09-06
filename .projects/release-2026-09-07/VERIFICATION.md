# Release verification

The inventory covers 162 issues and 721 pull requests as retrieved on 7 September 2026. `TRIAGE.md` records the open-item decisions. This document records evidence, not release completion.

## Completed locally

- Latest main (`32306a8`) incorporated; the Rust port and its preserved local branches were discarded at the user's request.
- Accepted feature changes integrated with shared settings, upload transport, hierarchy, overwrite protection, macro IDs and OAuth/v2 reconciled.
- Added regression coverage for formatted/nested callouts, literal image examples, selected Markdown embeds, dates, task IDs in page chrome, renderer cleanup and large-diagram timeout configuration.
- Node 24.15.0 / pnpm 11.1.2 / Vite+ 0.1.24: frozen installation, `vp run check`, `vp run fmt:check`, `vp test run` (178 passed, one opt-in live test skipped) and `vp run build` pass.
- Five public package tarballs install in a clean project. The installed library works through ESM and CommonJS dynamic import. The installed CLI accepts stdin and writes valid ADF without credentials. PlantUML package exports load.
- Real Puppeteer rendering passes from both the workspace and installed package. A 100-step diagram rendered at 129 × 10470 pixels using the configurable 600000 ms protocol timeout.
- ARM64 Docker build and offline conversion pass. The rebuilt Puppeteer renderer uses the container's Debian Chromium and produces a valid 458 × 70 PNG. The first draft PR also passed the Linux AMD64 build; the final multi-architecture registry manifest remains to be verified.
- Actionlint 1.7.12 validates the workflows. Artifact preparation tests cover missing build outputs, mismatched package versions and invalid CommonJS bundles. A separate upload-script smoke test uses temporary local Git repositories and a fake GitHub release service; it verifies no publication after a build failure, eight uploaded assets on first publication, an idempotent retry and rejection of differing existing assets.

Local logs and tarballs are in `.git/codex-release-20260907/` and are not committed as release artifacts. The CLI's incompatible legacy `bundleDependencies` setting was removed after a real `vp pm pack` failure; package contents are restricted to built distribution files plus package metadata, README and license.

## Dependency remediation

The initial audit reported 65 findings. Compatible updates and targeted overrides reduced that to three reported advisories: two for the locally patched image-size parser and one for UUID 3 through Atlaskit telemetry. The inspected Atlaskit call sites use UUID v4; the advisory concerns buffer handling in v3/v5/v6. No audit findings have been hidden or suppressed.

The image-size fix has bounded-worker regression tests and is bundled into the library as well as the CLI/Obsidian builds, because workspace patches do not propagate to npm consumers. A direct test of the built library's public upload adapter confirms malformed ICNS terminates and preserves the attachment fallback. See `patches/README.md` for the fix and upstream advisory references.

A real PlantUML PNG was generated successfully from synthetic test content (230 × 158 pixels). Live publication and browser inspection also pass for fenced and embedded PlantUML diagrams.

## Dedicated live fixtures

- Confluence space: [Markdown Confluence Release Tests 2026-09-07](https://markdown-confluence.atlassian.net/wiki/spaces/MCRT20260907/overview?homepageId=986448062).
- Parent page: `986448062`.
- Test vault: `/Users/andrewmcclenaghan/porting/markdown-confluence-release-vault`.
- Latest rebuilt plugin and manifest are installed in the vault's `confluence-integration` directory. Settings target only the dedicated test space. No API token is committed or included in reports.
- Fixtures cover formatting, callouts, Unicode, tables, nested lists, links, anchors, page hierarchy, PNG/SVG dimensions, non-image attachments, Mermaid, PlantUML, heading embeds, page headers/footers, TOC, ignored code blocks, folder/tag selection and explicit exclusions.

The local vault token field is still empty, and Obsidian remains in Restricted Mode pending the requested approval. Existing GitHub repository secrets enabled a separate successful live publishing test without exposing credentials locally.

The [live Confluence verification run](https://github.com/markdown-confluence/markdown-confluence/actions/runs/34066365424) at `4358288` created/verified eight pages, checked remote ADF, attachments, labels, hierarchy, source frontmatter and exclusions, confirmed an unchanged run preserved every page version, and updated only the modified note. Browser inspection confirmed formatting, callouts, tables, Unicode, task checkboxes, TOC, PNG/SVG images, nested images, file attachments, Mermaid and PlantUML rendering. Subsequent CI also exercises the built CLI executable; that result remains pending.

Live testing found and fixed three round-trip differences: TOC inline-to-block rewriting, title slugs added to Confluence page links, and default image dimensions/display metadata. Non-image attachments now use the media-group representation Confluence stores. Regression tests retain detection of real page/anchor/origin and image-resizing changes.

OAuth regression tests cover attachment/label pagination, custom headers, pagination origin confinement, complete ancestor traversal and failure when ancestor permissions are missing. A live OAuth client-credentials account has not been configured.

The [Obsidian community catalog](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json) currently does not contain `confluence-integration`. Installation documentation now uses release artifacts; issue #797 remains open for catalog reinstatement.

The companion Action update is prepared in [publish-action PR #11](https://github.com/markdown-confluence/publish-action/pull/11). Its 17 inputs and workflow syntax pass local validation. Runtime verification and release depend on publishing the 6.0.0 container.

## Remaining release gates

1. Complete the built CLI check and the separate Obsidian create → inspect → unchanged publish → update flow. The library-based live Confluence flow passes. Obsidian still needs its local API token and the requested Restricted Mode approval.
2. Exercise overwrite protection, failure recovery, duplicate titles, missing references and OAuth/v2 behavior. Keep issues with insufficient reproduction evidence open.
3. PlantUML rendering, publication and browser inspection pass with explicit synthetic-fixture opt-in.
4. Pass the branch's Linux/Windows verification, CodeQL and dependency review; verify both container architectures.
5. Finalize version 6 release notes and linked version manifests. The migration guide is in `documentation/MIGRATING_TO_6.md`. Regenerate the stale release PR.
6. Publish and verify npm packages, immutable container version plus moving aliases, Obsidian release assets and companion publish-action. Verify the Obsidian community listing separately.
7. Reconcile GitHub PR/issue state against the behavior actually delivered. Do not close roadmap or partial-coverage trackers as fully fixed.

## Release workflow recovery

The `release-please` workflow uses the maintained `googleapis/release-please-action` v5 manifest interface. Publishing checks out the root release tag, validates its version and ancestry, then runs the repository's Vite+ checks, tests and build before packaging. Obsidian metadata is copied after Vite empties `dist`.

A maintainer can dispatch the workflow from main with an existing `obsidian-confluence-root-vX.Y.Z` tag to finish publication. Published npm versions are skipped by recursive publishing. An existing container version must identify the same commit and include AMD64 and ARM64 before it can be reused. Existing GitHub release assets must match byte for byte and are never overwritten. Obsidian metadata updates are limited to the distribution files, with the versions compatibility map preserved.
