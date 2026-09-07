# LaTeX equations

Obsidian, the CLI and the Docker image automatically render LaTeX math during publication:

```markdown
Inline energy $E=mc^2$ stays in this sentence.

$$
\begin{aligned}
a &= \frac{1}{2} \\
b &= \sqrt{x^2+y^2}
\end{aligned}
$$
```

Inline equations become Confluence inline images; display equations become centered image blocks. Inline math also works in lists and table cells. Put `$$` on its own lines for multiline equations, or write a single-line display equation as `$$x^2$$`. Use display math for tall fractions and matrices: Confluence fits inline images to the surrounding line height.

Rendering uses bundled MathJax 4 and TeX fonts locally, then uploads PNG attachments through the same authenticated client as other images. No Confluence Marketplace app, TeX installation, rendering server or extra credentials are needed. OAuth, scoped API tokens and unscoped API tokens use the existing publishing configuration. The source Markdown is not replaced with images on disk.

Repeated expressions share an attachment within a page. Filenames include the source, display mode and rendering revision; PNG output is deterministic so unchanged equations do not cause attachment or page updates.

The supported syntax is MathJax's TeX mathematics, including AMS environments and expression-local `\newcommand`. Full LaTeX documents, external files, HTML/URL macros, dynamically loaded extensions and document-wide macro definitions are not supported. Invalid equations fail the affected page's publication with an error instead of silently disappearing. Expressions are limited to 16,384 characters and rendered dimensions of 4096 pixels per side.

Escaped dollars and dollar signs inside inline/fenced/indented code remain literal. Dollar delimiters must touch the equation (`$x$`, not `$ x $`); escape currency dollars when mixed with mathematics to avoid ambiguous delimiters.

The file conversion commands preserve equation source as math extension nodes before publication and restore `$…$`/`$$…$$` on Markdown export. Published Confluence pages contain images: lossless export preserves those image nodes, not editable TeX. Confluence currently strips uploaded image alt text, so the original Markdown remains the source of truth.

## Library integrations

Register `new MathRendererPlugin(new PuppeteerMathRenderer())` with `Publisher`, alongside any other rendering plugins. `MathRendererPlugin`, `MathExpression` and `MathRenderer` are exported by `@markdown-confluence/lib`; `PuppeteerMathRenderer` and `ElectronMathRenderer` are exported by the existing Puppeteer and Electron renderer packages respectively. A custom renderer must return deterministic PNG buffers at twice the logical display size.

## Verification

- `vp test run`: math parsing, literal syntax, AMS rendering, invalid input, macro isolation, deduplication, placement and conversion round trips.
- `vp run test:integration quick`: real Chromium equation rendering and identical PNG output across render sessions.
- `vp run test:integration live`: real equation attachments, unchanged library/CLI republishing, updates, recovery and inline-comment preservation in the dedicated test space.
- `vp run test:integration obsidian --vault /path/to/test-vault --dataview`: the built plugin's Electron renderer, unchanged pages/attachments and comments after edits elsewhere.

See [Testing](TESTING.md) for the test vault and authentication setup. Live profiles require an explicitly configured test destination.
