## YAML Frontmatter Support

The Confluence Integration plugin for Obsidian supports various YAML frontmatter items, allowing you to customize and modify how the publish process works.

### connie-title

This item allows you to override the title of the Confluence page without renaming the Obsidian file.

#### Example

```yaml
---
connie-title: New Title
---
```

### connie-frontmatter-to-publish

This item is set to an array of frontmatter keys that you want to include in a table at the beginning of the document.

#### Example

The example below will include four rows in the Frontmatter table at the beginning of the document.

```yaml
---
array-singleline:
  - testing
  - testing
array-multiline:
  - testing tag1
  - testing tag2
string: Testing
boolean-value: true
connie-frontmatter-to-publish:
  - array-singleline
  - array-multiline
  - string
  - boolean-value
---
```

### tags

This item reuses the [Tags](https://help.obsidian.md/Editing+and+formatting/Tags) feature from Obsidian, allowing you to specify [Confluence Labels](https://support.atlassian.com/confluence-cloud/docs/use-labels-to-organize-your-content/) that will be applied to the page. Tags must be a single string without spaces and can include a hyphen (-).

#### Example

```yaml
---
tags:
  - testing
  - test-tag
---
```

### connie-page-id

This item specifies the Confluence Page ID that the file will be uploaded to. It is set for every file. If it is not set when you publish a file, it will be assigned after the page has been created for that file in Confluence.

#### Example

```
---
connie-page-id: "12312"
---
```

### connie-dont-change-parent-page

If you want to move a Confluence page outside of your page tree and into another Space, you can use this item to prevent the page from being moved back to the file tree where the plugin would expect the page to be when matching the local file tree. When used with the [Folder Note](./folder-note.md) feature, you can move an entire folder of files to a new location in Confluence.

#### Example

```yaml
---
connie-dont-change-parent-page: true
---
```
