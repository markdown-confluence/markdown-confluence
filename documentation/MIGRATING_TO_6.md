# Migrating from 5.5.2 to 6

Version 6 updates the publishing library, CLI, container and desktop Obsidian plugin together. The public library API and package module format changed since 5.5.2, so this is a major release. Existing Markdown and Confluence page IDs remain the basis of the publishing workflow.

## Node.js and library integrations

Use Node.js 24.15.0, the version used for release verification. Packages expose ESM entry points and TypeScript declarations. Replace direct CommonJS `require("@markdown-confluence/lib")` with `await import("@markdown-confluence/lib")`, or use ESM imports. Import through the package's public entry point rather than internal `dist` paths.

The old `LoaderAdaptor` and `SettingsLoader` constructor arguments have been replaced by settings, a Confluence client and the processing plugins:

```ts
import {
  ConfluenceUploadSettings,
  Publisher,
  createAuthenticatedConfluenceClient,
  runEffect,
} from "@markdown-confluence/lib";

const settings = {
  ...ConfluenceUploadSettings.DEFAULT_SETTINGS,
  contentRoot: "/absolute/path/to/notes",
  folderToPublish: "docs",
  confluenceBaseUrl: "https://example.atlassian.net",
  confluenceParentId: "123456",
  atlassianUserName: "publisher@example.com",
  atlassianApiToken: "READ_FROM_YOUR_SECRET_STORE",
};
const client = await runEffect(createAuthenticatedConfluenceClient(settings));
const results = await new Publisher(settings, client, []).publish();
```

Add `MermaidRendererPlugin` and a renderer when publishing Mermaid diagrams. `PlantumlRendererPlugin` and `@markdown-confluence/plantuml-renderer` are optional. Effect integrations can use `publishEffect`, `MarkdownWorkspaceService` and the exported platform layers. Custom workspace integrations must implement the current `MarkdownWorkspace` service instead of the removed adaptor API.

## Publishing behavior

- Publishing preserves edits by another Confluence user unless `forceOverwrite` is explicitly enabled. Review an overwrite conflict before enabling that setting.
- `contentRoot` controls the scan root. `folderToPublish` controls default selection; matching YAML `tags` and `connie-publish: true` can select additional notes. `connie-publish: false` always excludes a note.
- Selecting notes in separate folders expands the publishing tree to their common ancestor. Folder notes named after the folder, `index.md`, `README.md`, or `readme.md` supply folder-page content. Automatically generated folder pages keep the standard child-page listing.
- Publishing writes `connie-page-id` and `connie-page-url` to source frontmatter. Existing IDs continue to address existing pages.
- Literal examples of embeds in code stay literal. Markdown heading and block embeds select only the referenced section and rebase relative assets.
- Page headers and footers apply to Markdown source pages. Use a fenced `toc` block for a table of contents. Configure ignored code-block languages when excluding content such as Dataview queries.

## CLI, container and authentication

The npm CLI executable remains `cli`; `npx @markdown-confluence/cli` also runs it. The new `to-adf` command converts a file or stdin without Confluence credentials. Publish failures now exit unsuccessfully with a useful, redacted error.

The CLI requires Node 24.15.0 or newer. The container uses Node 24.15.0 and Debian Chromium and supports AMD64 and ARM64. Its entry point is the CLI: pass `to-adf` directly after the image name for offline conversion. Mount the source directory writable when publishing because frontmatter is updated. The standalone image runs as an unprivileged user; ensure that user can write the mounted notes.

Confluence Cloud is the supported target; Server and Data Center are unsupported. Basic API-token authentication remains the default. Scoped tokens use the Atlassian gateway with the account email; unscoped tokens also work against the site origin. Bearer tokens and extra request headers remain available. The obsolete REST-prefix setting is ignored and has been removed from the Obsidian UI.

OAuth client credentials are available through the CLI/library and publishing Action. See the [Cloud OAuth setup guide](CLOUD_OAUTH.md) for service accounts, scopes and examples. Configure both the Atlassian API gateway URL and the browsable Confluence site URL. The account needs the relevant page, attachment, label and space permissions, including `read:content.metadata:confluence` for ancestor checks. Tokens are obtained once per invocation; split runs that exceed the token lifetime. Obsidian also supports service accounts and native browser login with rotating tokens in SecretStorage. Device-code support requires Atlassian to enable the grant for the app; see [Obsidian OAuth](OBSIDIAN_OAUTH.md).

## Confluence SDK and REST endpoints

The library now uses `confluence.js` 3.2.0. All authentication modes use REST v2 for pages, blog posts, spaces, ancestors, attachment reads and label reads. Current-user lookup, multipart attachment uploads and label writes retain supported v1 endpoints. See the [Cloud API migration](CLOUD_API_MIGRATION.md) for the route and authentication matrix.

Custom client integrations must migrate to the v3 SDK contract. `createConfluenceClientConfig` returns `ClientConfig` with `host`, `auth` and `headers`; the old `authentication`, `apiPrefix`, Axios configuration and middleware fields are no longer supported. Prefer `createAuthenticatedConfluenceClient(settings, { fetch })` for an injected transport; the old `createClient` override is removed. Direct `sendRequest` calls use SDK v3 `body` and `searchParams`, rather than Axios `data` and `params`. Multipart uploads use native `FormData` and `Blob`. `RequiredConfluenceClient` exposes publisher models instead of the removed SDK v2 `Api`, `Models` and `Parameters` namespaces.

`confluenceApiPrefix`, `DEFAULT_CONFLUENCE_API_PREFIX` and `normalizeConfluenceApiPrefix` remain as deprecated compatibility fields/exports. Endpoint paths are supplied by the SDK; these values no longer change routing.

## Diagrams

Mermaid uses the updated renderer. The Puppeteer protocol timeout defaults to 180000 ms and can be increased with `mermaidProtocolTimeout` or `CONFLUENCE_MERMAID_PROTOCOL_TIMEOUT` for large diagrams.

PlantUML is disabled by default. Enabling it sends diagram source to the configured PlantUML server; choose your own server or one you trust. PNG is the default. Library consumers can select SVG, which retains its extension and content type during upload.

## Obsidian distribution

Install `main.js` and `manifest.json` from the [integration releases](https://github.com/markdown-confluence/obsidian-integration/releases) into `.obsidian/plugins/confluence-integration` in the vault. Enable the plugin in Obsidian's community-plugin settings. The plugin is currently absent from the community catalog; catalog reinstatement remains separate from releasing downloadable artifacts.

Back up the vault before upgrading. Test the new version in a separate vault and Confluence space before using it with an existing publishing tree.
