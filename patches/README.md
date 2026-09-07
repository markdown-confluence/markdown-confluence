# Dependency patches

`image-size@2.0.2.patch` repairs the parser used to determine attachment dimensions. Version 2.0.2 is still the latest published version. The upstream ICNS and HEIF/JXL infinite-loop advisories have no published fix:

- https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq

The patch validates ICNS entry lengths, requires complete box headers, handles ISO box size zero as extending to the end of the input, and bounds DataView reads to the supplied Uint8Array instead of its larger backing buffer. Both ESM and CommonJS generated entry points and format modules are patched.

`ImageParserSafety.test.ts` runs malformed inputs in workers with deadlines so a regression cannot hang the test runner. It also checks valid ICNS dimensions and a valid HEIF box with size zero.

The library bundles this patched parser, and `image-size` is a development dependency. This is necessary because pnpm workspace patches do not propagate to npm consumers. The CLI and Obsidian builds also contain the patched implementation. Keep the patch until an upstream release with equivalent fixes is available and verified.
