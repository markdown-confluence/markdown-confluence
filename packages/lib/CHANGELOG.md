# Changelog

## [4.7.4](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.7.3...@markdown-confluence/lib-v4.7.4) (2023-04-29)


### Bug Fixes

* Check for duplicate page titles not file names. ([540b1f9](https://github.com/markdown-confluence/markdown-confluence/commit/540b1f93cd20784f9c7c8f14895221667fe5f3f5))

## [4.7.3](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.7.2...@markdown-confluence/lib-v4.7.3) (2023-04-29)


### Bug Fixes

* Replace spaces in hashFragment not linkToPage ([ed446e8](https://github.com/markdown-confluence/markdown-confluence/commit/ed446e87a1a12d7014efeff37ae39e161b558e0c))

## [4.7.2](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.7.1...@markdown-confluence/lib-v4.7.2) (2023-04-28)


### Bug Fixes

* Don't specify default for contentRoot on CommandLineArgumentSettingsLoader. ([ec8c338](https://github.com/markdown-confluence/markdown-confluence/commit/ec8c3387dc4d324acf49853917f5ee8c95442e7e))

## [4.7.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.7.0...@markdown-confluence/lib-v4.7.1) (2023-04-28)


### Bug Fixes

* Update the common path to include parent ([076effd](https://github.com/markdown-confluence/markdown-confluence/commit/076effdab718709df8c0a57faca917d3d152a41b))

## [4.7.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.6.4...@markdown-confluence/lib-v4.7.0) (2023-04-28)


### Features

* Add links to updated pages on Completed Dialog ([65c1a42](https://github.com/markdown-confluence/markdown-confluence/commit/65c1a42b7b039512d5582b055f8adfb4f25333c8))


### Bug Fixes

* Replace spaces with `-` to match what confluence uses. ([92b9d2d](https://github.com/markdown-confluence/markdown-confluence/commit/92b9d2d9266ac777cc8ae4cbcd665f591a17b636))
* Wrap check for file in try catch to report the errors better ([3fabce0](https://github.com/markdown-confluence/markdown-confluence/commit/3fabce0fb09573106552a37586bc1caf3883da6a))

## [4.6.4](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.6.3...@markdown-confluence/lib-v4.6.4) (2023-04-28)


### Bug Fixes

* Don't load settings when first initialising Publisher. Fixes issue when no settings available in set up situation. ([ceb21e7](https://github.com/markdown-confluence/markdown-confluence/commit/ceb21e7c193752394003545438d583323c0bccc6))
* My bad ([1acc9b8](https://github.com/markdown-confluence/markdown-confluence/commit/1acc9b8303948da962b0da614d74f8daf67eabff))
* Remove debug console.logs ([f89e617](https://github.com/markdown-confluence/markdown-confluence/commit/f89e6178f63e42a85c0e25bfe180fea270b82bba))

## [4.6.3](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.6.2...@markdown-confluence/lib-v4.6.3) (2023-04-28)


### Bug Fixes

* Wrong Ordering of AutoSettingsLoader Loaders ([4b1dc22](https://github.com/markdown-confluence/markdown-confluence/commit/4b1dc22895001646b638997536706053bda7cbf2))

## [4.6.2](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.6.1...@markdown-confluence/lib-v4.6.2) (2023-04-28)


### Bug Fixes

* More debugging ([215ff9b](https://github.com/markdown-confluence/markdown-confluence/commit/215ff9b619fa2adc2669a76c67a40ddb4f71fd93))

## [4.6.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.6.0...@markdown-confluence/lib-v4.6.1) (2023-04-28)


### Bug Fixes

* Temp hack to show all files to be published ([d3539e9](https://github.com/markdown-confluence/markdown-confluence/commit/d3539e9e503d16dd8277847f28214d8a7552d51f))

## [4.6.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.5.0...@markdown-confluence/lib-v4.6.0) (2023-04-28)


### Features

* Add "." option to folderToPublish to allow publishing whole contentRoot ([54c53ac](https://github.com/markdown-confluence/markdown-confluence/commit/54c53ac6860b06a3d3f8e8e278b01be5d3ea333c))

## [4.5.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.4.0...@markdown-confluence/lib-v4.5.0) (2023-04-28)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.4.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.3.0...@markdown-confluence/lib-v4.4.0) (2023-04-27)


### Features

* Allow ConfigFile path to be provided as env var "CONFLUENCE_CONFIG_FILE" ([1311a93](https://github.com/markdown-confluence/markdown-confluence/commit/1311a930c09963f932146e482d444ea9df8bd553))

## [4.3.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.8...@markdown-confluence/lib-v4.3.0) (2023-04-27)


### Features

* Allow setting content root for FilesystemAdaptor ([d008f29](https://github.com/markdown-confluence/markdown-confluence/commit/d008f294170561cec8ebfc7aa54352fb34c8cc44))


### Bug Fixes

* If environment variable is empty or "" then don't use. ([b0b7684](https://github.com/markdown-confluence/markdown-confluence/commit/b0b7684f42906710929833f5883aab31fefc8e10))
* Trim and add back the contentRoot ([c48a9c0](https://github.com/markdown-confluence/markdown-confluence/commit/c48a9c0171bf34655ac5b3826ae0b35fdb4085f1))


### Dependencies

* **deps:** bump @atlaskit/adf-utils in /packages/lib ([3b5ae81](https://github.com/markdown-confluence/markdown-confluence/commit/3b5ae81d740f9519581e42b7e56896ad874bf7f2))
* **deps:** bump @atlaskit/editor-json-transformer from 8.8.3 to 8.8.4 ([b9a4496](https://github.com/markdown-confluence/markdown-confluence/commit/b9a4496c9963b8da44dc89a602865077fa912028))

## [4.2.8](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.7...@markdown-confluence/lib-v4.2.8) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.2.7](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.6...@markdown-confluence/lib-v4.2.7) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.2.6](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.5...@markdown-confluence/lib-v4.2.6) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.2.5](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.4...@markdown-confluence/lib-v4.2.5) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.2.4](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.3...@markdown-confluence/lib-v4.2.4) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.2.3](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.2...@markdown-confluence/lib-v4.2.3) (2023-04-26)


### Bug Fixes

* Bump version ([f22975a](https://github.com/markdown-confluence/markdown-confluence/commit/f22975a0899fa895b06f6ec3be6046d7958e08d5))

## [4.2.2](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.1...@markdown-confluence/lib-v4.2.2) (2023-04-26)


### Bug Fixes

* Rename links to align with repo rename ([742e98c](https://github.com/markdown-confluence/markdown-confluence/commit/742e98c3b6d29caab074e7a09d744120069b2d99))

## [4.2.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.2.0...@markdown-confluence/lib-v4.2.1) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.2.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.1.1...@markdown-confluence/lib-v4.2.0) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.1.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.1.0...@markdown-confluence/lib-v4.1.1) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.1.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.0.4...@markdown-confluence/lib-v4.1.0) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.0.4](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.0.3...@markdown-confluence/lib-v4.0.4) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.0.3](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.0.2...@markdown-confluence/lib-v4.0.3) (2023-04-26)


### Bug Fixes

* Update Token to support packages ([73d3b54](https://github.com/markdown-confluence/markdown-confluence/commit/73d3b544781c927cf847dfe34e839201cb5b92d2))

## [4.0.2](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.0.1...@markdown-confluence/lib-v4.0.2) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.0.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.0.0...@markdown-confluence/lib-v4.0.1) (2023-04-26)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [4.0.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.7.0...@markdown-confluence/lib-v4.0.0) (2023-04-26)


### ⚠ BREAKING CHANGES

* No longer bundling the lib package to help with tree shaking and code navigation

### Features

* Initial CLI version ([85b4aff](https://github.com/markdown-confluence/markdown-confluence/commit/85b4aff13921accf6dd376e18929f3a19087757e))

## [3.7.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.6.1...@markdown-confluence/lib-v3.7.0) (2023-04-24)


### Features

* Ignore comments when comparing pages to see if page has changed ([8cedbed](https://github.com/markdown-confluence/markdown-confluence/commit/8cedbedeaac229a2ceec31a11d7494c35845064b))
* Make ADF the same as what Confluence returns. ([a223c72](https://github.com/markdown-confluence/markdown-confluence/commit/a223c72057fe154f3a47916fb97e1c92830bdf7c))
* Map Inline Comments with best effort ([b1d8db3](https://github.com/markdown-confluence/markdown-confluence/commit/b1d8db3eb1d68ebc06c614052ea41693f47842e2))


### Bug Fixes

* Add category when uploading Sarif file ([3fb888b](https://github.com/markdown-confluence/markdown-confluence/commit/3fb888b9600aea095892c50dc210779df709c240))

## [3.6.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.6.0...@markdown-confluence/lib-v3.6.1) (2023-04-21)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [3.6.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.5.0...@markdown-confluence/lib-v3.6.0) (2023-04-21)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [3.5.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.4.1...@markdown-confluence/lib-v3.5.0) (2023-04-21)


### Features

* Custom ADF via Codeblock and adf language ([8e91630](https://github.com/markdown-confluence/markdown-confluence/commit/8e916307b14654da4bc54bc71579e2a0283b365f))


### Bug Fixes

* Add missing homepage and bugs to package.json ([c920345](https://github.com/markdown-confluence/markdown-confluence/commit/c92034563ce2f8d11a40ed2c68b104807eace3be))

## [3.4.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.4.0...@markdown-confluence/lib-v3.4.1) (2023-04-20)


### Bug Fixes

* Add repository information for providence ([362e025](https://github.com/markdown-confluence/markdown-confluence/commit/362e0252bd24440f6311286e2b4446ffcf458dc4))

## [3.4.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.3.0...@markdown-confluence/lib-v3.4.0) (2023-04-20)


### Features

* Add npm provenance ([ee76005](https://github.com/markdown-confluence/markdown-confluence/commit/ee760054c80d9e385f559c18111b379f30fd3da0))
* **blog:** Blog support. ([e0bdc24](https://github.com/markdown-confluence/markdown-confluence/commit/e0bdc248c9845f4a609f7d9f9c7de388ea183b12))
* Update Confluence Page Settings Command ([a7d395e](https://github.com/markdown-confluence/markdown-confluence/commit/a7d395e5a2ddc9323a683bc9c877f8878740422a))
* Write `connie-publish: true` to all files that have been published to ensure even if you move the files they still will be published. ([a7d395e](https://github.com/markdown-confluence/markdown-confluence/commit/a7d395e5a2ddc9323a683bc9c877f8878740422a))

## [3.3.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.2.0...@markdown-confluence/lib-v3.3.0) (2023-04-18)


### Features

* Update a page when you are the last modifier ([5c42d77](https://github.com/markdown-confluence/markdown-confluence/commit/5c42d7787cf4c53098759ac221a81369e033df3d))


### Bug Fixes

* npm fmt ([206269c](https://github.com/markdown-confluence/markdown-confluence/commit/206269cc887eb75659dd77673318715eb3db1457))

## [3.2.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.1.0...@markdown-confluence/lib-v3.2.0) (2023-04-18)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [3.1.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v3.0.1...@markdown-confluence/lib-v3.1.0) (2023-04-18)


### Bug Fixes

* Bump lib ([18c4d27](https://github.com/markdown-confluence/markdown-confluence/commit/18c4d27b07d21ed793bbb8492d83109afde1356d))
* NPM Access to Public ([74be60d](https://github.com/markdown-confluence/markdown-confluence/commit/74be60d2db7eb106cb55202006b9afa1cb4fea2d))


### Miscellaneous Chores

* release 2.0.0 ([a9eae0c](https://github.com/markdown-confluence/markdown-confluence/commit/a9eae0cf43f20e3eb57096792c78f7215e6f2dd0))
* release 3.0.0 ([cc12c74](https://github.com/markdown-confluence/markdown-confluence/commit/cc12c74227dd7f6f0ed2d52b5120d7b727aa37a1))

## [3.0.1](https://github.com/markdown-confluence/markdown-confluence/compare/lib-v3.0.0...lib-v3.0.1) (2023-04-18)


### Bug Fixes

* NPM Access to Public ([74be60d](https://github.com/markdown-confluence/markdown-confluence/commit/74be60d2db7eb106cb55202006b9afa1cb4fea2d))

## [3.0.0](https://github.com/markdown-confluence/markdown-confluence/compare/lib-v3.0.4...lib-v3.0.0) (2023-04-18)


### Bug Fixes

* Bump lib ([18c4d27](https://github.com/markdown-confluence/markdown-confluence/commit/18c4d27b07d21ed793bbb8492d83109afde1356d))


### Miscellaneous Chores

* release 2.0.0 ([a9eae0c](https://github.com/markdown-confluence/markdown-confluence/commit/a9eae0cf43f20e3eb57096792c78f7215e6f2dd0))
* release 3.0.0 ([cc12c74](https://github.com/markdown-confluence/markdown-confluence/commit/cc12c74227dd7f6f0ed2d52b5120d7b727aa37a1))

## [3.0.0](https://github.com/markdown-confluence/markdown-confluence/compare/3.0.1...3.0.0) (2023-04-18)


### Bug Fixes

* Bump lib ([18c4d27](https://github.com/markdown-confluence/markdown-confluence/commit/18c4d27b07d21ed793bbb8492d83109afde1356d))


### Miscellaneous Chores

* release 2.0.0 ([a9eae0c](https://github.com/markdown-confluence/markdown-confluence/commit/a9eae0cf43f20e3eb57096792c78f7215e6f2dd0))
* release 3.0.0 ([cc12c74](https://github.com/markdown-confluence/markdown-confluence/commit/cc12c74227dd7f6f0ed2d52b5120d7b727aa37a1))

## [3.0.1](https://github.com/markdown-confluence/markdown-confluence/compare/3.0.0...3.0.1) (2023-04-18)


### Bug Fixes

* Bump lib ([18c4d27](https://github.com/markdown-confluence/markdown-confluence/commit/18c4d27b07d21ed793bbb8492d83109afde1356d))

## [3.0.0](https://github.com/markdown-confluence/markdown-confluence/compare/2.1.1...3.0.0) (2023-04-18)


### Miscellaneous Chores

* release 2.0.0 ([a9eae0c](https://github.com/markdown-confluence/markdown-confluence/commit/a9eae0cf43f20e3eb57096792c78f7215e6f2dd0))
* release 3.0.0 ([cc12c74](https://github.com/markdown-confluence/markdown-confluence/commit/cc12c74227dd7f6f0ed2d52b5120d7b727aa37a1))
