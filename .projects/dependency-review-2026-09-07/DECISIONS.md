# Package PR decisions — 7 September 2026

Review base: released main `78e4b4692f06479259a7cd57e3d2c02ea9ea698c`. All 15 remaining package-update PRs were inspected, including full diffs and checks on the recorded heads. Fourteen update only a package manifest and omit the shared pnpm lockfile. A current failure log confirms ERR_PNPM_OUTDATED_LOCKFILE; that alone is repairable and is not treated as proof that a dependency is incompatible.

## Decision

Replace 13 fragmented or outdated PRs with this verified dependency batch. Discard the two Confluence.js 3 one-line bumps: remove the CLI's unused direct SDK dependency and retain v2 for the library and Obsidian adapter until a proper SDK migration is implemented. The recommendations below distinguish accepting an upgrade from accepting the original PR unchanged; GitHub records the current open/closed/merged state.

| Dependency family | Selected version | Reason |
|---|---|---|
| effect, @effect/platform-node, @effect/vitest | 4.0.0-rc.112 throughout the workspace | Keep runtime, Node platform and test adapter aligned. |
| @atlaskit/adf-schema | 57.3.4 | Match the current utility and JSON-transformer dependency requirements. |
| @atlaskit/adf-utils | 20.9.4 | Upgrade with schema and ProseMirror. |
| @atlaskit/editor-json-transformer | 9.8.0 | Remove the old schema/ProseMirror family retained by transformer 8.33.2. |
| @atlaskit/editor-prosemirror | 8.0.3 | Current matching ProseMirror package; TypeScript 6 meets its minimum. |
| chalk | 6.0.0 | Node 24 meets its Node 22 minimum; current CLI usage remains supported. |
| confluence.js | Retain ^2.1.0 in lib/Obsidian; remove unused CLI declaration | Version 3 requires a separate client/transport migration. |

## Per-PR review

| PR | Decision | Reason | Reviewed head |
|---|---|---|---|
| [#892](https://github.com/markdown-confluence/markdown-confluence/pull/892) | Replace with coordinated upgrade | Replace the isolated Obsidian platform-node RC bump with the complete Effect rc.112 family. platform-node rc.112 requires effect ^4.0.0-rc.112; this PR leaves beta.70 installed. | `80ecf688c068` |
| [#891](https://github.com/markdown-confluence/markdown-confluence/pull/891) | Replace with coordinated upgrade | Replace the isolated CLI platform-node RC bump with the complete Effect rc.112 family. Its effect peer requirement is not met by beta.70. | `7e1f4bb953f6` |
| [#890](https://github.com/markdown-confluence/markdown-confluence/pull/890) | Replace with coordinated upgrade | Accept the RC upgrade through the coordinated batch; this PR changes only Obsidian effect and leaves the other runtimes and test adapter behind. | `98c86f966130` |
| [#889](https://github.com/markdown-confluence/markdown-confluence/pull/889) | Replace with coordinated upgrade | Accept the RC upgrade through the coordinated batch; this PR changes only CLI effect and leaves the library, renderer, root and test adapter behind. | `bcf44006e3f5` |
| [#881](https://github.com/markdown-confluence/markdown-confluence/pull/881) | Discard | Discard this one-line v3 bump. Confluence.js 3 removes Api, Client, Config, Models, Parameters, ConfluenceClient, BaseClient, middleware and Axios transport APIs used by our library/Obsidian adapter. A coordinated v3 experiment fails compilation. Migration needs transport, auth, multipart, error and endpoint changes plus live tests. | `53b8b34baffc` |
| [#878](https://github.com/markdown-confluence/markdown-confluence/pull/878) | Discard | Discard this bump and remove the CLI direct devDependency instead. CLI source does not import confluence.js; it uses the library, which owns the SDK dependency. The CLI builds and passes tests without this redundant dependency. | `1f0b5f8fd8d9` |
| [#864](https://github.com/markdown-confluence/markdown-confluence/pull/864) | Replace with coordinated upgrade | Discard the old beta.102 platform-node target as superseded by the tested complete rc.112 family; the isolated PR also leaves effect at beta.70. | `e308303c73be` |
| [#863](https://github.com/markdown-confluence/markdown-confluence/pull/863) | Replace with coordinated upgrade | Accept Chalk 6.0.0 in the coordinated batch with its lockfile update. Its Node >=22 requirement is satisfied by Node 24.15.0, and CLI build/error/conversion checks pass. | `f4ab0a8a8c5f` |
| [#857](https://github.com/markdown-confluence/markdown-confluence/pull/857) | Replace with coordinated upgrade | Discard the old beta.102 Effect target as superseded by the tested complete rc.112 family. | `860c6bdbf4f7` |
| [#820](https://github.com/markdown-confluence/markdown-confluence/pull/820) | Replace with coordinated upgrade | Discard the old beta.85 platform-node target as superseded by the tested complete rc.112 family; its isolated version change is not a complete runtime update. | `d57d55a9f905` |
| [#816](https://github.com/markdown-confluence/markdown-confluence/pull/816) | Replace with coordinated upgrade | Discard the old beta.85 Effect target as superseded by the tested complete rc.112 family. | `81fe48d1a25d` |
| [#812](https://github.com/markdown-confluence/markdown-confluence/pull/812) | Replace with coordinated upgrade | Accept a coordinated Atlaskit upgrade, superseding the older schema 56 target. Current adf-utils 20.9.4 requires schema ^57.3.0; use schema 57.3.4 with the matching transformer and ProseMirror packages. | `f86156b7530b` |
| [#810](https://github.com/markdown-confluence/markdown-confluence/pull/810) | Replace with coordinated upgrade | Accept adf-utils 20.9.4 with schema 57.3.4, editor-json-transformer 9.8.0 and editor-prosemirror 8.0.3. The isolated PR omits the lockfile and leaves older coupled packages. | `7fccc80f3f74` |
| [#809](https://github.com/markdown-confluence/markdown-confluence/pull/809) | Replace with coordinated upgrade | Accept editor-prosemirror 8.0.3 with the coordinated Atlaskit packages and lockfile. The major removes TypeScript 4 support; the repository uses TypeScript 6. Full builds and conversion regressions pass. | `5a6a91cddcac` |
| [#777](https://github.com/markdown-confluence/markdown-confluence/pull/777) | Replace with coordinated upgrade | Discard the obsolete beta.76 core-only update as superseded by the complete rc.112 family. Its old green checks apply to an older base and do not validate the current release or matching platform-node/vitest upgrades. | `979a6506a12c` |

## Verification and future updates

- Coordinated Effect rc.112 plus Chalk/Atlaskit builds and passes all 182 regression tests, with one opt-in live test skipped in the regular suite.
- The final combined dependency set passes Vite+ formatting, lint/checks, all package builds and release preparation. Linux/Windows and live Confluence verification run on the replacement PR before merge.
- All 10 Markdown fixtures produce the same ADF as the released runtime after excluding generated local IDs.
- A separate experiment updating all SDK consumers to Confluence.js 3.2.0 fails compilation because public client/config/model exports and sendRequest are gone. The failed experiment was reverted completely.
- The original isolated PR checks mostly stop at a stale lockfile, before exercising code. The replacement includes the lockfile and preserves Node 24.15.0, pnpm, Vite+ and the existing parser patches.
- Dependabot now uses the root pnpm workspace only for npm updates. Separate subdirectory jobs caused manifest-only PRs. Effect and Atlaskit dependencies are grouped; GitHub Actions and Docker updates remain enabled. No security alerts or update families are suppressed.
- The published 6.0.0 artifacts are unchanged by this review. A later release will distribute the approved upgrades.

## Primary sources

- [Chalk 6 release notes](https://github.com/chalk/chalk/releases/tag/v6.0.0).
- [Effect rc.112 release notes](https://github.com/Effect-TS/effect/releases/tag/effect@4.0.0-rc.112) and [platform-node peer requirements](https://registry.npmjs.org/@effect%2fplatform-node/4.0.0-rc.112).
- [Confluence.js 3 migration and removed APIs](https://github.com/MrRefactoring/confluence.js/releases/tag/v3.0.0).
- Published Atlaskit package metadata and bundled changelogs: [schema 57.3.4](https://registry.npmjs.org/@atlaskit%2fadf-schema/57.3.4), [utils 20.9.4](https://registry.npmjs.org/@atlaskit%2fadf-utils/20.9.4), [transformer 9.8.0](https://registry.npmjs.org/@atlaskit%2feditor-json-transformer/9.8.0), [ProseMirror 8.0.3](https://registry.npmjs.org/@atlaskit%2feditor-prosemirror/8.0.3).
- [GitHub Dependabot workspace/group configuration](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
