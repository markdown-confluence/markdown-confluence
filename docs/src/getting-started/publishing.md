## Getting Started: Publishing and Moving Pages

This section provides a brief overview of the recommended workflow for publishing pages using the Confluence Integration plugin for Obsidian and how to move them in Confluence if necessary.

### Publishing Pages

1. Install and configure the Confluence Integration plugin for Obsidian. Ensure that you have provided the required API credentials and settings.

2. Organize your files and folders within your Obsidian vault according to your desired Confluence structure.

3. Use YAML frontmatter to customize page properties, such as `connie-title`, `tags`, and `connie-frontmatter-to-publish`, as needed.

4. Publish your pages by running the publish command provided by the Confluence Integration plugin. The plugin will upload your pages and files, maintaining the folder structure and hierarchy defined in your Obsidian vault.

### Moving Pages in Confluence

If you need to move a page or a folder within Confluence, follow these steps:

1. In Confluence, navigate to the page you want to move.

2. Click the ellipsis (three dots) in the upper right corner of the page and select **Move** from the dropdown menu.

3. Choose the new parent page or Space where you want to move the page.

4. In Obsidian, update the corresponding file's YAML frontmatter with the `connie-dont-change-parent-page` property set to `true`. This will prevent the Confluence Integration plugin from moving the page back to its original location when matching the local file tree.

   Example:

   ```yaml
   ---
   connie-dont-change-parent-page: true
   ---
   ```

5. If you are moving an entire folder, ensure you have a [Folder Note](./folder-note.md) for the folder and add the `connie-dont-change-parent-page` property to the Folder Note as well.

6. Run the publish command in Obsidian to update the pages with the new frontmatter settings.

By following this workflow, you can effectively publish and manage your pages in Confluence while maintaining the organization and structure of your Obsidian vault.
