# Kroki diagrams

Kroki renders fenced diagram blocks into attachments in Confluence Cloud. It is
optional and disabled by default. Configure a trusted Kroki server before enabling
it: diagram source is sent to that server. Confluence credentials are never sent
to Kroki. A self-hosted server can keep diagram source inside your network.

In Obsidian, open the Confluence settings, find **Kroki diagrams**, enter the server
URL and enable rendering. Choose PNG (default) or SVG. Supported diagram types
and output formats depend on your Kroki server.

For example:

````markdown
```kroki-graphviz
digraph G { Markdown -> Confluence }
```
````

The language is `kroki-` followed by the Kroki diagram type, such as `graphviz` or
`ditaa`. Existing Mermaid and PlantUML fences retain their existing renderers.

CLI configuration:

```json
{
  "kroki": {
    "enabled": true,
    "serverUrl": "https://kroki.example.com",
    "format": "png",
    "timeoutMs": 30000
  }
}
```

Equivalent CLI flags are `--krokiEnabled`, `--krokiServerUrl`, `--krokiFormat` and
`--krokiTimeoutMs`. Environment variables use `CONFLUENCE_KROKI_ENABLED`,
`CONFLUENCE_KROKI_SERVER_URL`, `CONFLUENCE_KROKI_FORMAT` and
`CONFLUENCE_KROKI_TIMEOUT_MS`.

Identical diagrams within a page are rendered once. Stable attachment names let
unchanged publications reuse attachments; changed source produces a new image.
Renderer errors stop publication instead of silently replacing diagrams with
invalid images. Requests time out after 30 seconds by default.

Run `vp run test:integration kroki` against the dedicated test space to verify
Graphviz and Ditaa, PNG/SVG, updates, unchanged publication and inline comments.
This test sends only synthetic diagrams to the public `https://kroki.io` service.

The fence convention is adapted from the
[PTCInc fork](https://github.com/PTCInc/markdown-confluence). The upstream
implementation renders directly through the [Kroki API](https://docs.kroki.io/kroki/setup/usage/)
instead of requiring pre-rendered SVG files.
