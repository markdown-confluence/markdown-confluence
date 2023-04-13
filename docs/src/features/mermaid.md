## Mermaid Diagram Support

As Confluence does not currently support [Mermaid](https://mermaid.js.org/) diagrams natively, the Confluence Integration plugin for Obsidian provides a workaround to enable the rendering of Mermaid diagrams. The plugin includes a copy of Mermaid that is injected into a [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), which is then used to render each diagram and capture a screenshot as a PNG image. This image is then uploaded to Confluence for rendering.

### Usage

1. Create a Mermaid diagram in your Obsidian note using the appropriate syntax.

_Insert example here_

2. When you publish your files using the Confluence Integration plugin, the plugin will automatically render the Mermaid diagram, capture a screenshot, and upload it as a PNG image to Confluence.

_Insert example here_

### Naming Convention

To prevent conflicts with file names when uploading diagrams to Confluence, the plugin uses the following naming convention for the uploaded diagram images:

```
RenderedMermaidChart-${MD5 of diagram text}.png
```

This naming convention helps to avoid conflicts and ensures that each uploaded diagram image has a unique identifier.

### Limitations

Currently, the Confluence Integration plugin does not support deleting diagram images from Confluence.
