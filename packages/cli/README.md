# @markdown-confluence/cli

`@markdown-confluence/cli` is a powerful tool that allows you to publish your markdown files as Confluence pages. It is designed to work seamlessly in various environments, including NPM CLI, Docker Container, and GitHub Actions, enabling you to use your docs wherever you need them. Comprehensive documentation for the tool can be found at [https://markdown-confluence.com/](https://markdown-confluence.com/).

## Usage Examples

### CLI

**Example setup**

`.markdown-confluence.json`:

```json
{
  "confluenceBaseUrl": "https://markdown-confluence.atlassian.net",
  "confluenceParentId": "524353",
  "atlassianUserName": "andrew.mcclenaghan@gmail.com",
  "folderToPublish": "."
}
```

**Environment Variables**

macOS / Linux:

```bash
export ATLASSIAN_API_TOKEN="YOUR API TOKEN"
```

Windows:

```bash
set ATLASSIAN_API_TOKEN="YOUR API TOKEN"
```

[Learn more about `set` command](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/set_1)

**CLI Command**

```bash
npx @markdown-confluence/cli
```

### Docker Container

**Example setup**
```bash
docker run -it --rm -v "$(pwd):/content" -e ATLASSIAN_API_TOKEN ghcr.io/markdown-confluence/publish:latest
```

### GitHub Actions

**Example setup**

`.github/workflows/publish.yml`:

```yaml
name: Publish to Confluence
on: [push]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
      - name: Publish Markdown to Confluence
        uses: markdown-confluence/publish@v1
        with:
          atlassianApiToken: ${{ secrets.ATLASSIAN_API_TOKEN }}
```

**Environment Variables**

Add your API token as a secret in your GitHub repository settings:

1. Go to your repository's `Settings` tab.
2. Click on `Secrets` in the left sidebar.
3. Click on `New repository secret`.
4. Name it `ATLASSIAN_API_TOKEN` and enter your API token as the value.
5. Click on `Add secret`.