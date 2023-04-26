# Callouts

The Callouts feature allows you to transform Markdown callouts, also known as admonitions, into Atlassian Document Format (ADF) [Panels](https://support.atlassian.com/confluence-cloud/docs/insert-the-info-tip-note-and-warning-macros/). This feature supports both normal and foldable callouts.

## Normal Callouts

Normal callouts are converted to [Panels](https://support.atlassian.com/confluence-cloud/docs/insert-the-info-tip-note-and-warning-macros/) in Confluence. 

### Example:
```md
> [!note]
> Lorem ipsum dolor sit amet
```


## Foldable Callouts 

Foldable callouts are converted to [Expand Macros](https://support.atlassian.com/confluence-cloud/docs/insert-the-expand-macro/) in Confluence. Note that Expand Macros do not support the same colors and formatting that Panels do.

### Example:
```md
> [!faq]- Are callouts foldable?
> Yes! In a foldable callout, the contents are hidden when the callout is collapsed.
```

## Nested Callouts

Due to Confluence restrictions, nested callouts are not supported.

## Supported Features

- Title
- Types: Refer to the [supported types](https://github.com/markdown-confluence/markdown-confluence/blob/main/src/MarkdownTransformer/callout.ts#L8-L70)
- Foldable

For more information on Obsidian callouts, visit the [Obsidian documentation](https://help.obsidian.md/Editing+and+formatting/Callouts).


