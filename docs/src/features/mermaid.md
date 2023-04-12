Due to Confluence not currently supporting [Mermaid](https://mermaid.js.org/) diagrams. To enable support for Mermaid the plugin includes a copy of Mermaid that is injected into a [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) which is used to render each diagram and screenshot them into a png image that is uploaded to Confluence for rendering.

To make it easier to ensure no conflicts on file names when uploading diagrams to Confluence the filename is set to `RenderedMermaidChart-${MD5 of diagram text}.png. 

Currently no diagram images are deleted from Confluence.