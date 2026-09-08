# Selective fork contributions

These features adapt ideas from community forks to the current Cloud publishing pipeline. They do not import the forks' old clients or build tooling.

## Publishing controls

`foldersToExclude` is an array of paths relative to the content root (the vault in Obsidian). Exclusions override `connie-publish: true` and publish tags. `private` excludes `private/note.md`, not `private-other/note.md`. This controls which pages are published; it does not redact content explicitly embedded from another note.

Set it in `.markdown-confluence.json`, use `--excludeFolders private,drafts`, or use **Excluded folders** in Obsidian's Confluence settings.

Obsidian shows publish progress in the status bar. Click it or run **Cancel publishing after the current request** to stop. Cancellation lets an active operation finish, keeps completed writes, and prevents subsequent operations. It does not roll back pages or attachments already created. The result lists pages that did not publish; publishing again resumes ordinary reconciliation.

Library callers can pass `{ signal: controller.signal }` as the second argument to `publish` or `publishEffect`.

## Validation, planning and reports

```sh
markdown-confluence validate --input notes/example.md --output validation.json
markdown-confluence validate --enableFolder notes --output -
markdown-confluence plan --enableFolder notes --output plan.json
markdown-confluence --enableFolder notes --report publish.json
markdown-confluence --enableFolder notes --report -
```

`validate` works without Confluence credentials. It checks conversion, titles and local hierarchy. Without `--input`, it uses the normal folder/tag/exclusion selection. Explicit `--input` validates that file independently of selection.

`plan` requires the normal Cloud credentials and performs read-only page discovery. It never creates placeholder pages, renders/uploads attachments or changes local frontmatter. Existing pages are marked `reconcile`, since determining every content, attachment, label and permission change requires the publishing pipeline. New pages are marked `create`; ambiguous/inaccessible pages are `blocked`. Treat this as preflight, not an exact prediction of version changes.

Reports use `schemaVersion: 1`. Validation and planning support `--output FILE` or `--output -`; publishing supports `--report FILE` or `--report -`. A failed validation or partial publishing failure returns a nonzero exit status. Publishing reports include per-page failures; errors before page discovery may prevent a publishing report. No credentials are included in reports.

## Footnotes

```markdown
A reference[^source], and the same reference again[^source].

[^source]: A **formatted** definition.

    An additional paragraph in the same footnote.
```

Numeric and named labels, repeated references, multiline definitions and inline notes use the Markdown parser. Code and escaped syntax remain literal. Generated Confluence anchors link references to definitions and back. Header/footer fragments use separate anchor namespaces.

## Excerpts and page properties

Use an explicit fenced block whose contents are Markdown:

````markdown
```confluence-excerpt summary
Reusable **summary** text.
```

```confluence-properties record
| Property | Value |
| --- | --- |
| Owner | Documentation team |
```
````

The name after the fence language identifies the excerpt or properties record. Multiple blocks get deterministic macro IDs. No arbitrary frontmatter is published automatically. Existing raw `adf` fences remain available for lossless expressions and exports.

## YAML tables

````markdown
```yaml-table
- Count: 0
  Enabled: false
  Literal: "<"
- Count: 12
  Enabled: true
  Literal: "^"
```
````

For explicit spans, use columns and rows. A spanned-over column is omitted from the row input; absent remaining cells are empty.

````markdown
```yaml-table
columns: [Name, Details]
rows:
  - [{value: Group, colspan: 2}]
  - [{value: Shared, rowspan: 2}, First]
  - [Second]
```
````

Scalar values preserve `0`, `false`, and empty text. Literal `<` and `^` never merge cells. Invalid or overlapping spans fail conversion instead of deleting content. Tables are limited to 100 columns and 1000 rows. Cells contain literal scalar text; use ordinary Markdown or raw ADF for richer cell content.

## Jira shorthand

Set `jiraUrl` in JSON, use `--jiraUrl https://example.atlassian.net`, or set **Jira site URL** in Obsidian. Explicit `JIRA: DOCS-123` becomes a Smart Link. Code and existing links are left intact; formatting on surrounding text is preserved. This does not grant access to the linked issue.

## Mermaid output

```json
{
  "mermaid": {
    "format": "png",
    "scale": 2,
    "theme": "neutral",
    "themeVariables": { "primaryColor": "#ddebff" }
  }
}
```

CLI options: `--mermaidFormat png|svg`, `--mermaidScale 1..4`, `--mermaidTheme neutral`. Obsidian exposes output, scale and theme variables alongside its existing theme selector. PNG remains the default; scale controls raster resolution. SVG uploads use the correct SVG MIME type. Rendering options do not relax Mermaid's strict security mode. Different output formats get distinct attachment filenames.

## Page ordering

Enable `orderPages: true`, `--orderPages`, or **Apply page ordering** in Obsidian. Add numeric `sort-order` frontmatter to at least two sibling pages. Lower values come first; ties use page IDs for stability.

Ordering applies only to successfully published, explicitly ranked pages sharing a parent. Unranked pages are not managed; pages with preserved parents and blog posts are excluded. Single-note publishing does not reorder siblings. The implementation reads the existing order through the v2 children endpoint and uses Cloud's v1 move endpoint where an order change is needed; v2 remains in use for the supported page operations. Permissions/API failures are surfaced. Completed content writes remain if ordering fails.

## Verification

```sh
vp test run
vp run check
vp run build
vp run test:integration fork-ports --settings-from /path/to/test-settings.json
```

The dedicated-site profile verifies conversion, real publishing, unchanged republishing, PNG/SVG, exclusions, ordering, cancellation/restart, and an inline comment surviving edits elsewhere. Run it for unscoped tokens, scoped tokens and OAuth. The integration harness writes reports under `reports/integration/`.

## Attribution and scope

- [Dongmin-Cho](https://github.com/Dongmin-Cho/obsidian-integration): unresolved link-mark fix, exclusions/cancellation and footnote anchors.
- [renato-dransay](https://github.com/renato-dransay/markdown-confluence/commit/57064aa19b8cfae2d25db766a885294eff03e985): preflight/reporting ideas. Our planner deliberately avoids the fork's write-capable dry-run path.
- [derari](https://github.com/derari/markdown-confluence/tree/merge): excerpt/properties, YAML table and comparison ideas. Explicit span semantics replace destructive marker handling.
- [PTCInc](https://github.com/PTCInc/markdown-confluence): Jira shorthand.
- [FASTEC](https://github.com/FASTEC/markdown-confluence/tree/features/mermaid), [NickSmet](https://github.com/NickSmet/markdown-confluence), [aaronsb](https://github.com/aaronsb/obsidian-to-confluence): ordering and renderer options.
- Footnote tokenization uses the MIT-licensed [markdown-it-footnote](https://github.com/markdown-it/markdown-it-footnote) package.

The review's deferred MCP preview and Kroki proposals remain separate future work. Server/Data Center changes, credential logging, unrelated rewrites and obsolete dependencies were not selected.

### Verification recorded for this port

On 8 September 2026, the live feature profile passed with an unscoped API token and OAuth. Both runs covered inline-comment preservation, repeated publishing, rendering, exclusions, cancellation/restart and ordering. OAuth testing found and fixed use of the retired v1 child-page listing endpoint.

The real Obsidian desktop profile also passed with the new feature fixture and settings/command checks. Automated unit tests, formatting, linting and workspace builds passed.

Scoped-token verification is pending: the saved test credential returned HTTP 404 when reading the dedicated test parent, before feature execution. This is not recorded as a scoped-token pass.
