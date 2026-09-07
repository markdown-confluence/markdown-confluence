# Markdown and ADF conversion

`to-adf` converts Markdown into Atlassian Document Format (ADF) JSON. `to-markdown`
converts ADF into Markdown; `from-adf` is an alias. Both commands read files or
stdin, write files or stdout, and can read a Confluence page by URL or ID.
Conversion does not publish pages or change source files.

## Files and streams

```bash
vp dlx @markdown-confluence/cli to-adf "notes/source page.md" --output "exports/page.adf.json"
vp dlx @markdown-confluence/cli to-markdown "exports/page.adf.json" --output "exports/page.md"
vp dlx @markdown-confluence/cli from-adf --input "exports/page.adf.json" --output "exports/readable.md" --readable

cat notes/page.md | vp dlx @markdown-confluence/cli to-adf - > page.adf.json
cat page.adf.json | vp dlx @markdown-confluence/cli to-markdown - > page.md
```

During development, replace `vp dlx @markdown-confluence/cli` with
`node packages/cli/dist/index.js` after `vp run build`. Output directories must
already exist. An explicitly named output file is replaced only after input has
been read and converted successfully. `-o` abbreviates `--output`, `-i` abbreviates
`--input`, and `--output -` selects stdout. Use `--` before filenames that begin
with a hyphen. One source is converted per invocation.

## Confluence input

```bash
vp dlx @markdown-confluence/cli to-markdown \
  "https://example.atlassian.net/wiki/spaces/DOCS/pages/123456/Page" \
  --config .markdown-confluence.json --output page.md

vp dlx @markdown-confluence/cli to-adf --page 123456 \
  --config .markdown-confluence.json --output page.adf.json
```

The existing configuration and environment variables provide authentication:
`CONFLUENCE_BASE_URL`, `ATLASSIAN_USERNAME`, `ATLASSIAN_API_TOKEN`, or the existing
bearer/OAuth settings. `CONFLUENCE_CONFIG_FILE` also selects the configuration file.
A publishing parent ID is **not required** for these reads. An OAuth gateway
configuration still needs `confluenceSiteUrl` for the human-facing page URL.

Supported page references are numeric IDs with `--page`, full `/pages/ID/Title`
URLs, legacy `viewpage.action?pageId=ID` URLs, and space overview URLs containing
`homepageId=ID`. Short share links need their full page URL or numeric ID. URL
input must match the configured site; requests use the existing configured
Confluence client. `to-adf URL` exports the page's original ADF directly.

Local JSON input may be a complete ADF document or a Confluence REST response
containing `body.atlas_doc_format.value`. Invalid JSON/documents fail with a
nonzero exit status and diagnostics on stderr, leaving stdout empty.

## Existing ADF fence preservation

The repository already supports an `adf` fenced code block containing a node to
insert into a document. Conversion reuses that format; it does not introduce a
second syntax for Confluence features.

````markdown
```adf
{
  "type": "paragraph",
  "content": [{ "type": "status", "attrs": { "text": "READY", "color": "green", "localId": "status-1" } }]
}
```
````

Complete `{ "type": "doc", "version": 1, "content": [...] }` documents can also
be placed inside a fence. A complete document on its own is restored as the
document, while its content is inserted when mixed with other Markdown. Raw ADF
is restored after Markdown normalization, preserving its attributes, marks,
extension parameters, and ordered-list starts. Malformed examples remain code.

`to-markdown` defaults to lossless conversion: ordinary blocks remain Markdown
when they reproduce the original ADF; blocks that would lose information use the
existing `adf` fence. This includes media IDs, layout widths, comment annotations,
unknown extensions, and unsupported node attributes. Empty paragraphs, adjacent
lists or document metadata can require preserving the complete document. A final
conversion check verifies that all ADF fields survive.

`--readable` prefers readable Markdown and may simplify presentation metadata:
cards become links, external images become Markdown images, dates become ISO
dates, statuses become bold text, and decisions become list items. Unsupported
content still uses ADF fences. It is intended for reading, not exact restoration.
Media with only Confluence attachment IDs stays in ADF; this command does not
download attachments or migrate IDs to a different page/site. Comments and macro
payloads are preserved as data, not recreated as server-side objects.

## Coverage of #260 and #264

The old issue checklists mix Markdown features with Confluence-only features.
The following is the supported conversion contract. “ADF fence” means the
existing reversible representation, rather than a new Markdown notation.

| Feature | Markdown input / ADF output | ADF input / Markdown output |
| --- | --- | --- |
| Paragraphs, text, headings, quotes, rules, line breaks | Native Markdown | Native Markdown |
| Bullet/ordered lists and list items | Native Markdown, including starting numbers | Native Markdown, retaining nesting and starting numbers |
| Task lists/items | `- [ ]` and `- [x]` | Task syntax; fences preserve original IDs in lossless mode |
| Tables, rows, header/data cells | Pipe tables, with column alignment | Pipe tables with alignment; merged/mixed cells use ADF fences |
| Code blocks and inline code | Markdown fences/backticks | Delimiters lengthened when content contains backticks |
| Strong, emphasis, strike, links | Native Markdown | Native Markdown with literal text escaped |
| Underline, subscript, superscript | `<u>`, `<sub>`, `<sup>` | Same limited formatting markup |
| Text/background color | `<span style="color: #rrggbb">` / `background-color` | Same limited markup; arbitrary HTML remains disabled |
| Inline cards | Existing link conversion or ADF fence | Links; ADF fence when payload needs preserving |
| Block/embed cards | ADF fence | Readable links; lossless ADF fence |
| Emoji and mentions | Existing mention syntax; `:id\|short_name:` emoji; Unicode text; ADF fence | Unicode/mention text; ADF fence retains IDs and metadata |
| Expand and panels | Existing callout syntax; ADF fence | Callouts; ADF fence preserves exact titles/custom attributes |
| Nested expand | ADF fence (nested callout flattening remains intentional) | Readable expand; lossless ADF fence |
| Image, media, mediaSingle | Existing Markdown images/embeds or ADF fence | External URLs as images; media IDs and sizing preserved via ADF fence |
| Caption, mediaGroup, mediaInline | ADF fence | Captions/external images where representable; otherwise ADF fence |
| Date, decision list/item, status, placeholder | ADF fence | Readable date/list/bold/text; lossless ADF fence |
| Layout section/column | ADF fence | ADF fence preserves hierarchy and column widths |
| Unknown/unsupported block/inline and Confluence variants | ADF fence | ADF fence |
| Bodied/inline/ordinary extensions and Jira macros | Existing macro syntax where supported; ADF fence for arbitrary payloads | ADF fence |
| Alignment, indentation, annotation, inline comment, border, breakout | Table alignment or ADF fence | Table alignment; other block/annotation marks use ADF fence |
| Data consumer, fragment, type-ahead query, unsupported marks/node attributes | ADF fence | ADF fence preserves original values |

The document schema is described in the [Atlassian ADF documentation](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/).
Preserving a node does not guarantee that every Confluence product accepts it;
the converter retains it without claiming server-side support.

## Acceptance criteria

- **File input and file output for both commands:** read Markdown from a file and
  write ADF JSON to a file; read ADF JSON from a file and write Markdown to a file.
- Both directions accept positional input and `--input`, explicit `--output`,
  filenames containing spaces, stdin, and stdout.
- Markdown → ADF → Markdown → ADF preserves the generated ADF. Rich ADF →
  Markdown → ADF preserves every original JSON field in the default lossless mode.
- Invalid input exits nonzero without producing an output file or partial stdout.
- Confluence URLs and page IDs work with existing authentication without a parent
  ID, and conversion leaves the page version unchanged.
- Unknown nodes, marks and attributes survive using the **existing `adf` fences**.
- Formatting, table alignment, list starts, media/captions, special characters,
  nested structures and malformed ADF have focused regression coverage.
- The quick, packaged-consumer and live integration profiles exercise the actual
  built CLI. Live verification uses the dedicated Confluence test space.

Run `vp run test:integration`, `vp run test:integration packages --skip-build`, and
`vp run test:integration live --skip-build`. See [TESTING.md](TESTING.md) for setup.
