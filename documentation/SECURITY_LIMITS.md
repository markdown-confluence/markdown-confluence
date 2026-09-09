# File access and publishing limits

## Files stay inside the content root

The CLI and Node library treat `contentRoot` as the boundary for Markdown,
attachments, text embeds and metadata updates. Relative references can use
sibling folders inside that root, including folders outside `folderToPublish`.
References that leave the root are rejected. File lookup never searches above
the root.

Symlinks are checked against their resolved destinations. Links to files or
directories inside the root continue to work; links outside it are rejected.
Directory aliases are visited once to prevent traversal loops. A symlink used
as the configured root is supported. Move intended publishing resources inside
the root when an outside-root error occurs.

Obsidian checks physical destinations through its desktop filesystem adapter
before mapping them back to Vault-backed paths and reads. Vault symlinks that
point outside the vault or the configured content root are rejected. These
checks constrain document-controlled paths; they do not provide isolation from
a separate malicious local process concurrently changing filesystem entries.

## Markdown expansion has finite limits

Every prepared page, including pages prepared for validation or link mapping,
has independent limits:

| Limit | Default |
| --- | --- |
| Embed and embedded-link resolutions | 1,000 |
| Source, transformed or expanded page size | 10 MiB of UTF-8 |
| Cumulative expansion processing and copied content | 32 MiB |
| Embed ancestry | 50 files |

Every recursive branch consumes the same page budget. Repeating an empty note
still counts as a resolution. Link rebasing and the surrounding embed output
also count toward the limits. Cyclic embeds are rejected independently.

A limit error identifies the page and the exhausted budget. Split large pages
or reduce repeated embeds. Frontmatter cannot raise or disable these limits.
Missing in-root embeds retain the existing literal-reference behavior.

## Existing inline comments are preserved

Comment matching runs only for eligible selected pages after the existing
last-editor and content-type checks. Exact comparisons, candidate discovery
and both fuzzy matching passes share finite per-page budgets.

Defaults are 4,096 UTF-16 code units per fuzzy context side, 256 candidate
locations per comment, 1,000 annotations per page, 5,000,000 edit-distance cells
and 8,000,000 inspected code units. Long unchanged contexts can still match
exactly within the scanning budget.

When matching cannot safely decide, the original annotation IDs and text are
preserved in **Inline comments that couldn't be mapped** and a warning is
reported. If annotation extraction itself exceeds a limit, that page's content
is not updated. Other eligible pages may still publish; publishing is not a
transaction across the whole tree.

## Mermaid renders without external resources

Both local Mermaid renderers apply resource restrictions before processing
diagram source. Electron renders inside an isolated sandboxed window, including
SVG output. Diagram images, arbitrary local files, remote fonts, CSS imports,
network requests and navigation are blocked. Returned SVG is checked for
resource references so opening the attachment does not restore those loads.

Ordinary diagrams, theme colors, Unicode labels and PNG/SVG output remain
supported. Diagrams requiring external resources must be changed to use
self-contained shapes and labels. Theme CSS can supply styles, but its external
resources will not load. Mermaid's strict mode remains enabled.

These local-rendering restrictions are separate from explicitly configured
remote PlantUML or Kroki services, which receive diagram source as documented
for those features.
