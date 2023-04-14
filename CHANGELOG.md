# Changelog

## [2.1.0](https://github.com/obsidian-confluence/obsidian-confluence/compare/2.0.1...2.1.0) (2023-04-14)


### Features

* **build:** Minify outputs to save size in main.js file ([c879d5d](https://github.com/obsidian-confluence/obsidian-confluence/commit/c879d5ddb3f40376fea7b2ce903818865bcac175))
* **ci:** Export meta.json from esbuild ([c27ca7d](https://github.com/obsidian-confluence/obsidian-confluence/commit/c27ca7d67230a5aa051c94407a69745dbcf83f81))
* **tests:** Add initial unit tests and GH Actions to ensure they pass ([b7f636e](https://github.com/obsidian-confluence/obsidian-confluence/commit/b7f636e2fb8e8a99c06cd60d227e38ae9e8d2873))


### Bug Fixes

* **ci:** Fix errors ([ffeea5c](https://github.com/obsidian-confluence/obsidian-confluence/commit/ffeea5c80bde3c5674716059e450b8c6963f8e9d))
* **ci:** Learn to check ([a494231](https://github.com/obsidian-confluence/obsidian-confluence/commit/a494231840544e19cc8ac7bc090be6f327bc68dc))
* **ci:** Run Release Please via PAT to allow GHA checks to run ([adb0708](https://github.com/obsidian-confluence/obsidian-confluence/commit/adb07085f4bd026f994b5c8201abe0782e9b3828))
* **test:** Fix snapshot test to test passing all tests ([8e26790](https://github.com/obsidian-confluence/obsidian-confluence/commit/8e26790ff219105ccfd54078239515164369b0b6))


### Dependencies

* **deps:** bump @atlaskit/renderer from 107.2.0 to 107.3.2 ([7ae7a58](https://github.com/obsidian-confluence/obsidian-confluence/commit/7ae7a58ebdca4a516eba61504ef3299d4c42f6ce))

## [2.0.1](https://github.com/obsidian-confluence/obsidian-confluence/compare/2.0.0...2.0.1) (2023-04-13)


### Bug Fixes

* **images:** Fix for image upload ([6b973f2](https://github.com/obsidian-confluence/obsidian-confluence/commit/6b973f2fc2a97b299c1abb61708407c097a80706))

## [2.0.0](https://github.com/obsidian-confluence/obsidian-confluence/compare/1.4.0...2.0.0) (2023-04-12)


### Bug Fixes

* **Obsidian:** Update to match recommendations from https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md ([a038a46](https://github.com/obsidian-confluence/obsidian-confluence/commit/a038a46c08fb363d46a3f80ba431d165a507ca64))


### Miscellaneous Chores

* release 2.0.0 ([a9eae0c](https://github.com/obsidian-confluence/obsidian-confluence/commit/a9eae0cf43f20e3eb57096792c78f7215e6f2dd0))

## [1.4.0](https://github.com/obsidian-confluence/obsidian-confluence/compare/1.3.0...1.4.0) (2023-04-11)


### Features

* **PublishDialog:** Add more detail to publish completed / failed dialog ([ddce9fc](https://github.com/obsidian-confluence/obsidian-confluence/commit/ddce9fc483edd724f608e0d37f62030588da1d09))
* **SinglePage:** Publish updates for 1 page only ([41e5ac4](https://github.com/obsidian-confluence/obsidian-confluence/commit/41e5ac4f6dee96fd51531fe6200c9f34dd571261))
* **Wikilinks:** First pass at supporting Wikilinks Syntax ([57e9f65](https://github.com/obsidian-confluence/obsidian-confluence/commit/57e9f65da1ddb4beb21d997bdf8652a6eed29720))
* **Wikilinks:** Support smart links and pages in multiple spaces ([20656f4](https://github.com/obsidian-confluence/obsidian-confluence/commit/20656f489d32a50ebd70587f25ca0d167c721cf0))

## [1.3.0](https://github.com/obsidian-confluence/obsidian-confluence/compare/1.2.4...1.3.0) (2023-04-11)


### Features

* **AdfPreview:** Make local files render correctly in ADF Preview ([860bfb8](https://github.com/obsidian-confluence/obsidian-confluence/commit/860bfb8e5cf1f094231abd2f4b4e7ae6bc91e7fd))
* **eslint:** Add checks to GH Actions ([e786154](https://github.com/obsidian-confluence/obsidian-confluence/commit/e7861542f9dbe99bbc81bb0cecfee00f32ae5c5a))
* **PageId:** Specify PageId when page published to Confluence ([c545009](https://github.com/obsidian-confluence/obsidian-confluence/commit/c5450092bb8abdf106d80d5a12b4a075dbd61130))


### Bug Fixes

* **cli:** Build error ([8d2698b](https://github.com/obsidian-confluence/obsidian-confluence/commit/8d2698b47c6244fe2304b44b78b557358dfe5797))
* **eslint:** Fix eslint issues ([cbaa567](https://github.com/obsidian-confluence/obsidian-confluence/commit/cbaa5671bb7e16c1b79b636cb06ed930298b29a6))

## [1.2.4](https://github.com/obsidian-confluence/obsidian-confluence/compare/1.2.3...1.2.4) (2023-04-07)


### Bug Fixes

* **settings:** SaveSettings before Init ([64c4e41](https://github.com/obsidian-confluence/obsidian-confluence/commit/64c4e41565364525bfb2b53480630d30c875b91d))

## [1.2.3](https://github.com/obsidian-confluence/obsidian-confluence/compare/1.2.2...1.2.3) (2023-04-06)


### Bug Fixes

* **ci:** Remove extra comment in manifest.json ([05d9657](https://github.com/obsidian-confluence/obsidian-confluence/commit/05d965738ac77b951acc39348bb7e4a64c627b1f))

## [1.2.2](https://github.com/obsidian-confluence/obsidian-confluence/compare/1.2.1...1.2.2) (2023-04-06)


### Bug Fixes

* **ci:** Move manifest to root of repo to align with Obsidian requirements ([78d09e4](https://github.com/obsidian-confluence/obsidian-confluence/commit/78d09e43daad45aa0cf51f5f1ca874fa5b13e8e1))

## [1.2.1](https://github.com/obsidian-confluence/obsidian-confluence/compare/1.2.0...1.2.1) (2023-04-06)


### Bug Fixes

* **ci:** Remove v from github release ([3d3c07e](https://github.com/obsidian-confluence/obsidian-confluence/commit/3d3c07ef3b96c6f73561f5cd2aa0e44e7f6034c9))

## [1.2.0](https://github.com/obsidian-confluence/obsidian-confluence/compare/v1.1.0...1.2.0) (2023-04-06)


### Features

* **ci:** Add initial google-github-actions/release-please-action@v3 ([39cc200](https://github.com/obsidian-confluence/obsidian-confluence/commit/39cc2001113f6f846dddc56bc8ba75f5ff7ce026))


### Bug Fixes

* **ci:** Add support to bundle up files for plugin ([250984b](https://github.com/obsidian-confluence/obsidian-confluence/commit/250984b2baf462266d7cafc5a6eb7b82b0fd2dbb))
* **ci:** List files uploaded to GitHub ([7612bcd](https://github.com/obsidian-confluence/obsidian-confluence/commit/7612bcd6b67c8ba712611e553dff985f8cae38bd))
* **ci:** Remove component from tag ([362b07e](https://github.com/obsidian-confluence/obsidian-confluence/commit/362b07e58af2420eb37a7fcabdfa1f9161a6c954))
* **ci:** Remove Sourcemap to save size ([0a1398b](https://github.com/obsidian-confluence/obsidian-confluence/commit/0a1398bb880c3201598ec860c68c1b82b016fa4a))
* **ci:** Remove v from version number ([2a024bd](https://github.com/obsidian-confluence/obsidian-confluence/commit/2a024bdf2d640749561f41a24f79343005066d13))
* **ci:** Use manifest over gh actions auto config ([3dc8d2b](https://github.com/obsidian-confluence/obsidian-confluence/commit/3dc8d2bbe5a25c844cda5c224ab0da7c465a5622))
* **Mermaid:** Remove extra console.log ([cfbddd5](https://github.com/obsidian-confluence/obsidian-confluence/commit/cfbddd531d4b79e3bd2447e39299db19b6393014))

## [1.1.0](https://github.com/obsidian-confluence/obsidian-confluence/compare/obsidian-confluence-v1.0.4...obsidian-confluence-1.1.0) (2023-04-06)


### Features

* **ci:** Add initial google-github-actions/release-please-action@v3 ([39cc200](https://github.com/obsidian-confluence/obsidian-confluence/commit/39cc2001113f6f846dddc56bc8ba75f5ff7ce026))


### Bug Fixes

* **ci:** Add support to bundle up files for plugin ([250984b](https://github.com/obsidian-confluence/obsidian-confluence/commit/250984b2baf462266d7cafc5a6eb7b82b0fd2dbb))
* **ci:** List files uploaded to GitHub ([7612bcd](https://github.com/obsidian-confluence/obsidian-confluence/commit/7612bcd6b67c8ba712611e553dff985f8cae38bd))
* **ci:** Remove Sourcemap to save size ([0a1398b](https://github.com/obsidian-confluence/obsidian-confluence/commit/0a1398bb880c3201598ec860c68c1b82b016fa4a))
* **ci:** Remove v from version number ([2a024bd](https://github.com/obsidian-confluence/obsidian-confluence/commit/2a024bdf2d640749561f41a24f79343005066d13))
* **ci:** Use manifest over gh actions auto config ([3dc8d2b](https://github.com/obsidian-confluence/obsidian-confluence/commit/3dc8d2bbe5a25c844cda5c224ab0da7c465a5622))
* **Mermaid:** Remove extra console.log ([cfbddd5](https://github.com/obsidian-confluence/obsidian-confluence/commit/cfbddd531d4b79e3bd2447e39299db19b6393014))

## [1.0.4](https://github.com/obsidian-confluence/obsidian-confluence/compare/v1.0.3...v1.0.4) (2023-04-06)


### Bug Fixes

* **ci:** Remove v from version number ([2a024bd](https://github.com/obsidian-confluence/obsidian-confluence/commit/2a024bdf2d640749561f41a24f79343005066d13))

## [1.0.3](https://github.com/obsidian-confluence/obsidian-confluence/compare/v1.0.2...v1.0.3) (2023-04-06)


### Bug Fixes

* **Mermaid:** Remove extra console.log ([cfbddd5](https://github.com/obsidian-confluence/obsidian-confluence/commit/cfbddd531d4b79e3bd2447e39299db19b6393014))

## [1.0.2](https://github.com/obsidian-confluence/obsidian-confluence/compare/v1.0.1...v1.0.2) (2023-04-05)


### Bug Fixes

* **ci:** List files uploaded to GitHub ([7612bcd](https://github.com/obsidian-confluence/obsidian-confluence/commit/7612bcd6b67c8ba712611e553dff985f8cae38bd))
* **ci:** Remove Sourcemap to save size ([0a1398b](https://github.com/obsidian-confluence/obsidian-confluence/commit/0a1398bb880c3201598ec860c68c1b82b016fa4a))

## [1.0.1](https://github.com/obsidian-confluence/obsidian-confluence/compare/v1.0.0...v1.0.1) (2023-04-05)


### Bug Fixes

* **ci:** Add support to bundle up files for plugin ([250984b](https://github.com/obsidian-confluence/obsidian-confluence/commit/250984b2baf462266d7cafc5a6eb7b82b0fd2dbb))

## 1.0.0 (2023-04-05)


### Features

* **ci:** Add initial google-github-actions/release-please-action@v3 ([39cc200](https://github.com/obsidian-confluence/obsidian-confluence/commit/39cc2001113f6f846dddc56bc8ba75f5ff7ce026))
