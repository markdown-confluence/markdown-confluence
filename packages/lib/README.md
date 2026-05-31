# @markdown-confluence/lib

Core library for converting Markdown to Atlassian Document Format (ADF) and publishing Markdown workspaces to Confluence.

## Requirements

- Node.js 24.15.0 is used by this repository's CI.
- The package is published as ESM. Use `import` in ESM projects or dynamic `import()` from CommonJS.
- TypeScript projects should use a modern module resolution mode such as `Bundler`, `Node16`, or `NodeNext`.

## ESM Usage

```ts
import { convertMDtoADF } from "@markdown-confluence/lib";

const adf = convertMDtoADF("# Release notes");
console.log(adf);
```

## CommonJS Usage

CommonJS `require("@markdown-confluence/lib")` is not supported because the package is ESM-only. Use dynamic `import()` instead:

```js
async function main() {
	const { convertMDtoADF } = await import("@markdown-confluence/lib");
	const adf = convertMDtoADF("# Release notes");
	console.log(adf);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
```

## Features

- Markdown to ADF conversion
- Wikilink handling
- Image uploading support
- Mermaid diagram upload pipeline integration
- Comment preservation
- Diffing to avoid unnecessary uploads
