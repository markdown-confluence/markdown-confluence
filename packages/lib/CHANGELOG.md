# Changelog

## [5.1.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v5.0.1...@markdown-confluence/lib-v5.1.0) (2023-05-09)


### Features

* Add support for mentions ([f17dd84](https://github.com/markdown-confluence/markdown-confluence/commit/f17dd8460c7ee428846f1dc7adb4382ae3f772f2))
* ADF To Markdown ([7257893](https://github.com/markdown-confluence/markdown-confluence/commit/725789372481baef6ba20aaf37a82dc5ca126b2e))
* Diff page details to see if they have changed. If so then publish page. ([7e30ca8](https://github.com/markdown-confluence/markdown-confluence/commit/7e30ca80f4feb93b2b86b85a4bec70c0e93edf91))
* Handle smartcards storing URL without page name on the end ([d489f83](https://github.com/markdown-confluence/markdown-confluence/commit/d489f83b3f565bd986dd7fb801eb762142db8a13))


### Bug Fixes

* Add keywords to lib package ([a3043b0](https://github.com/markdown-confluence/markdown-confluence/commit/a3043b0bc87bf613c960b2296e4d6dfbdb7098ff))
* Circular imports ([4f49798](https://github.com/markdown-confluence/markdown-confluence/commit/4f49798ba17d5df40307aba208e637324ab79902))
* Fix issues with puppeteer rendering ([01824b6](https://github.com/markdown-confluence/markdown-confluence/commit/01824b60a2fc773550683a671d4ce2e4acb52855))
* Move SettingsLoaders to own files to help with TreeShaking ([f241a11](https://github.com/markdown-confluence/markdown-confluence/commit/f241a11a3967d8a06e827ec100dca15533d38902))
* Remove debug console.log ([bb56ed9](https://github.com/markdown-confluence/markdown-confluence/commit/bb56ed9e30de8b70d6ab9be7aaf29d899d50a83d))
* Replace all spaces not just first one ([c01ae97](https://github.com/markdown-confluence/markdown-confluence/commit/c01ae974445da898d69506fe754592d500b196f8))
* Settings path ([d1c43e6](https://github.com/markdown-confluence/markdown-confluence/commit/d1c43e66bfe0e3c50a3a79d81e46659e3e3e75ee))
* Tests ([4f91706](https://github.com/markdown-confluence/markdown-confluence/commit/4f91706e49cef54c53fce4729b155c4799686d1e))

## [5.0.1](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v5.0.0...@markdown-confluence/lib-v5.0.1) (2023-05-03)


### Miscellaneous Chores

* **@markdown-confluence/lib:** Synchronize obsidian packages versions

## [5.0.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.9.0...@markdown-confluence/lib-v5.0.0) (2023-05-03)


### Features

* Enable and fix all strict type checks ([c16ee2d](https://github.com/markdown-confluence/markdown-confluence/commit/c16ee2d83b6e30065f8c607afda652c4c21af6b3))
* Mark lib as sideEffects: false to help treeshaking ([1a622e3](https://github.com/markdown-confluence/markdown-confluence/commit/1a622e39cf5a84a86bcc7cbfd61eebd690a2ebfb))


### Bug Fixes

* Add settings to MdToADF Tests ([2c58c51](https://github.com/markdown-confluence/markdown-confluence/commit/2c58c51795e1efe0a2abc99c8b4774954466a222))
* frontmatterHeader adds content direct to ADF instead of Markdown now ([1230878](https://github.com/markdown-confluence/markdown-confluence/commit/12308783ae23fbb2fbcd9f39871bf4429c47e18b))
* ts errors in tests ([21f640e](https://github.com/markdown-confluence/markdown-confluence/commit/21f640e96ea5bbc6ccdc9049679c3be95bafdaab))


### Documentation

* Add README.md files to all NPM Packages ([75c4781](https://github.com/markdown-confluence/markdown-confluence/commit/75c47816b7895fd26d50382c316f83d6993cc56c))

## [4.9.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.8.0...@markdown-confluence/lib-v4.9.0) (2023-04-30)


### Features

* Add support for "index.md" as a folder file ([f598074](https://github.com/markdown-confluence/markdown-confluence/commit/f5980740cb99f0fa04cd0c66c6f5dba6ea78c288))


### Bug Fixes

* Bash to shell language map ([28ae75e](https://github.com/markdown-confluence/markdown-confluence/commit/28ae75ed118d86841a00797d6f1bd12225551cc3))

## [4.8.0](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.7.5...@markdown-confluence/lib-v4.8.0) (2023-04-30)


### Features

* Add new setting to allow you to use the first heading as the page title. ([ec4e426](https://github.com/markdown-confluence/markdown-confluence/commit/ec4e426700d241c29f84ac25b28893f28f20a555))

## [4.7.5](https://github.com/markdown-confluence/markdown-confluence/compare/@markdown-confluence/lib-v4.7.4...@markdown-confluence/lib-v4.7.5) (2023-04-30)


### Bug Fixes

* Handle #hash links better for names that have spaces and handle internal links ([7ad345a](https://github.com/markdown-confluence/markdown-confluence/commit/7ad345af210e346517535faa7a08d801b1660ded))

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
