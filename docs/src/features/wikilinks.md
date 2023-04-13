Wikilink support is very basic. It only supports linking to other files being published. 
If there is a wikilink to a page that isn't set to be published then during publish this link will be removed and it will be rendered as text in Confluence. 

Wikilinks supports pages being moved around in the 1 site but across multiple spaces. 

If you just link to a page then it will render with a [smart link](https://community.atlassian.com/t5/Confluence-articles/Smart-Links-a-richer-way-to-hyperlink/ba-p/1412786). If you provide a link to a header then it will render as `Page Name#Header`. If you provide an 

Wikilinks supports three ways to provide information about the link
## Link to Page
```md
[[Page To Link To]]
```
This will render as a [smart link](https://community.atlassian.com/t5/Confluence-articles/Smart-Links-a-richer-way-to-hyperlink/ba-p/1412786) to the page showing the page title and image. 

## Link to Header
```md
[[Page To Link To#Header]]
```
This will render as a [smart link](https://community.atlassian.com/t5/Confluence-articles/Smart-Links-a-richer-way-to-hyperlink/ba-p/1412786) to the page showing the page title and image. 

## Alias
```md
[[Page To Link To|Alias To Display]]
[[Page To Link To#Header|Alias To Display]]
```

This will render as a normal text that is a link to the page and header if included.