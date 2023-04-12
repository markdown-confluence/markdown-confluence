There is different supported `YAML` frontmatter items to enable you to specify different parameters to change how publish works.

## connie-title
This enables you to override the Title of the page without renaming the file

### Example
```yaml
---
connie-title: New Title
---
```

## frontmatter-to-publish
This is set to an array of the frontmatter keys to include in a table at the start of the document. 

### Example
The below will include 4 rows in the Frontmatter table at the start of the file. 
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
frontmatter-to-publish:
  - array-singleline
  - array-multiline
  - string
  - boolean-value
---
```

## tags
This reuses the [Tags](https://help.obsidian.md/Editing+and+formatting/Tags) feature from Obsidian to enable you to specify [Confluence Labels](https://support.atlassian.com/confluence-cloud/docs/use-labels-to-organize-your-content/) that are applied to the page. 
They need to be a single string with no spaces. They can include a `-`.

### Example
```yaml
---
tags:
  - testing
  - test-tag
---
```


## connie-page-id
This is the Confluence Page ID that the file will be uploaded to. This is set on **every** file. If you don't have it set when you publish a file it will be set after the page has been created for that file in Confluence. 

### Example
```
---
connie-page-id: 12312
---
```

## connie-dont-change-parent-page
	If you want to move a Confluence page outside your page tree into another Space you need to specify this to prevent the page from being moved back to the file tree where the Plugin would expect this page to live when matching the local file tree. If you use this with [Folder Note](./folder-note.md) you can move a whole folder of files to a new spot in Confluence. 

### Example
```yaml
---
connie-dont-change-parent-page: true
---
```