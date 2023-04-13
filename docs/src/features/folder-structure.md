## Folder Structure

The folder structure feature is designed to help you easily manage and organize your files when they are published to Confluence. The plugin will identify the first common folder and match the folder structure in your local Obsidian vault in Confluence. This also ensures the plugin will move pages on Confluence to align with your local file layout.

### Usage

When you publish your files, the plugin will automatically find the first common folder and upload the files according to that folder structure.

![](Pasted%20image%2020230413135017.png)

### Preventing Pages from Moving

If you don't want a specific page to be moved or you want to move a Confluence page outside of your page tree into another Space, you can use the `connie-dont-change-parent-page` tag. This will prevent the plugin from moving the page back to the file tree where it would expect the page to live when matching the local file tree.

```yaml
---
connie-dont-change-parent-page: true
---
```

### Moving a Folder with Folder Note

You can use the folder structure feature in conjunction with the [Folder Note](./folder-note.md) feature to move a whole folder of files to a new location in Confluence. By adding the `connie-dont-change-parent-page` tag to the Folder Note, you can prevent the pages within the folder from being moved back to their original locations in the file tree.
