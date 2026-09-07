# Publishing Dataview results

Enable Dataview in your Obsidian vault, then turn on **Publish Dataview results** in
Confluence Integration settings. This setting is off by default. Fenced
`dataview` TABLE, LIST and TASK queries are evaluated when you publish and their
results become ordinary Confluence content.

For example, a bibliography can select the notes you link to under `Papers`:

````markdown
[[Papers/Example paper]]

```dataview
TABLE authors AS Authors
FROM "Papers"
WHERE contains(this.file.outlinks, file.link)
```
````

The query stays in your source note, including when publication writes
`connie-page-id` and `connie-page-url` to frontmatter. Each publication evaluates
the query again. Editing a paper's authors changes the bibliography on its next
publication even if the bibliography's source has not changed. Unchanged results
do not create a new Confluence page version.

Queries inside embedded note sections use the embedded note's context, so `this`
refers to that note. Only the included section is evaluated. A single-note
publication evaluates that note and its included content, while other eligible
notes remain available for the existing Confluence page/link mapping.

## Output and limitations

- Tables, lists and ordinary checked/unchecked tasks use the existing native ADF
  conversion. Task results are snapshots; changing a task in Confluence does not
  update Obsidian.
- Paper links resolve to Confluence when their targets are in the selected
  publication set. Otherwise the existing publisher retains their text without
  a link. A query does not automatically select its results for publication.
- Array and object cells use Dataview's plain Markdown export, avoiding literal
  HTML list markup in table cells.
- `ignoredCodeBlockLanguages` takes precedence. If it contains `dataview`, those
  blocks remain omitted and are not evaluated. Remove that entry to publish their
  results. Ordinary code examples remain literal.
- Index initialization and recently edited Markdown dependencies are checked
  before evaluation. Indexing has a 15-second wait limit and each query has a
  30-second limit. Missing Dataview, query errors and timeouts identify the source
  note and stop preparation before Confluence page creation or content updates.
- CALENDAR and DataviewJS blocks report unsupported output when result publishing
  is enabled. Inline DQL/JavaScript expressions are not evaluated by this feature.
- Arbitrary JavaScript views, interactive charts and HTML rendering are outside
  this implementation. Existing native ADF and `adf` fences continue to handle
  supported content that Markdown cannot express.
- Live Dataview evaluation runs in Obsidian. The standalone CLI can accept already
  generated Markdown/ADF through its existing file and stdin commands.

## Source-transform hook

The library exports `MarkdownSourceTransformerService`, an Effect context
reference with an identity default. Supply a transformer when constructing a
workspace or providing `MarkdownWorkspaceLive`:

```ts
import { Effect } from "effect";
import {
  makeMarkdownWorkspaceEffect,
  MarkdownSourceTransformerService,
} from "@markdown-confluence/lib";

const workspaceEffect = makeMarkdownWorkspaceEffect(settings).pipe(
  Effect.provideService(MarkdownSourceTransformerService, {
    transform: (markdown, context) => Effect.tryPromise({
      try: () => renderSource(markdown, context),
      catch: (cause) => cause instanceof Error ? cause : new Error(String(cause)),
    }),
  }),
);
```

`renderSource` is your asynchronous transformation. Its context provides the
original platform `absoluteFilePath`, slash-separated `sourcePath` relative to
the content root, and frontmatter. Return Markdown; the hook runs before embed
expansion, ADF conversion, Confluence link resolution and image upload. Included
sections invoke the hook with their own note's context. Raw reads and frontmatter
write-back bypass it. The exported `transformMarkdownCodeBlocks` helper replaces
actual fenced blocks while preserving surrounding source and container prefixes.

## Integration test

Install and enable Dataview in the dedicated integration vault, then run:

```sh
vp run test:integration obsidian --dataview --vault ../markdown-confluence-integration-vault
```

Use `--skip-build` only after a current build. The standard test-vault marker and
Confluence destination checks apply. The test creates owned synthetic paper,
bibliography and embedded-context notes. It checks native output, outgoing links,
source preservation, unchanged versions, immediate dependency edits and query
failure without a remote update. It restores changed content and settings; the
fixture pages remain available for inspection. Results are written to
`reports/integration/obsidian-<timestamp>/dataview.json`.

See [TESTING.md](TESTING.md) for credentials and desktop setup.
