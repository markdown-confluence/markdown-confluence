#!/bin/bash

# Set variables
repo_owner="obsidian-confluence"
repo_name="obsidian-confluence"
version="$1"

if [ -z "$version" ]; then
  echo "Please provide a version number as an argument"
  exit 1
fi

prefixes=(
  ""
  "obsidian-confluence"
  "obsidian-confluence-root"
  "@markdown-confluence/lib"
  "@markdown-confluence/mermaid-electron-renderer"
)

mkdir -p .artifacts
cd .artifacts

for prefix in "${prefixes[@]}"; do
  # Add a '-' only if the prefix is not empty
  if [ -n "$prefix" ]; then
    prefix_with_dash="$prefix-v"
  else
    prefix_with_dash=""
  fi

  # Create download URL
  tag="${prefix_with_dash}$version"
  download_url="https://github.com/$repo_owner/$repo_name/archive/refs/tags/$tag.tar.gz"
  file_name="$tag.tar.gz"

  # Download the tar.gz file
  curl -L -o "$file_name" "$download_url"

  # Sign the tar.gz file
  gpg --armor --detach-sign "$file_name"

  gh release upload $tag $file_name

  echo "Signature for $tag uploaded to to https://github.com/obsidian-confluence/obsidian-confluence/releases/tag/$tag"
done
