## Image Upload

The Image Upload feature ensures that any images included in a page are uploaded as attachments for that specific page in Confluence. This means that if the same image is used in multiple pages, it is uploaded into each respective page as an attachment.

### Preventing Duplicate Image Uploads

In order to avoid retrieving the image from Confluence every time the publish process is run, the plugin uses the hash (MD5) of the image file contents and stores it as a comment on the attachment. This ensures that images are uploaded only once per page and are updated only when the contents change.

To prevent conflicts with file names when uploading images to Confluence, the plugin uses the following naming convention for the uploaded images:

```
${Absolute Path MD5}-${Filename without path}
```

This naming convention helps to avoid conflicts and ensures that each uploaded image has a unique identifier.

### Limitations

Currently, the Confluence Integration plugin does not support deleting images from Confluence.

### References

- [Embed an image in a note - Obsidian Help](https://help.obsidian.md/Linking+notes+and+files/Embedding+files#Embed+an+image+in+a+note)
- [Manage uploaded files - Atlassian Support](https://support.atlassian.com/confluence-cloud/docs/manage-uploaded-files/)
