## Wikilinks Support

The Confluence Integration plugin for Obsidian offers basic support for Wikilinks. This support is limited to linking to other files that are being published. If a Wikilink refers to a page that is not set to be published, the link will be removed during the publishing process and will be rendered as plain text in Confluence.

Wikilinks can be used to connect pages within a single Confluence site, including across multiple spaces.

When using Wikilinks, the plugin supports three ways to provide information about the link:

### Link to Page

```md
[[Page To Link To]]
```

This syntax creates a [smart link](https://community.atlassian.com/t5/Confluence-articles/Smart-Links-a-richer-way-to-hyperlink/ba-p/1412786) to the specified page, displaying the page title and image.

### Link to Header

```md
[[Page To Link To#Header]]
```

This syntax creates a [smart link](https://community.atlassian.com/t5/Confluence-articles/Smart-Links-a-richer-way-to-hyperlink/ba-p/1412786) to the specified page, displaying the page title and image. The link will point to a specific header within the page.

### Alias

```md
[[Page To Link To|Alias To Display]]
[[Page To Link To#Header|Alias To Display]]
```

This syntax allows you to define an alias for the link, which will be displayed instead of the original page title or header. The link will be rendered as regular text that points to the specified page and header (if included).
