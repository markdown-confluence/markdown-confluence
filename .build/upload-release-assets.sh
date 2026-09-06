#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
release_tag=${1:?Provide the root release tag}
release_sha=${2:?Provide the released commit SHA}
[[ "$release_tag" =~ ^obsidian-confluence-root-v([0-9]+\.[0-9]+\.[0-9]+)$ ]]
version=${BASH_REMATCH[1]}
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]]
[[ "$(git rev-parse HEAD)" == "$release_sha" ]]
[[ "$(git rev-parse --verify "$release_tag^{commit}")" == "$release_sha" ]]
[[ "$(node -p 'require("./package.json").version')" == "$version" ]]
[[ -d .release-repo/.git ]]
[[ "$(git -C .release-repo remote get-url origin)" == *markdown-confluence/obsidian-integration* ]]

# This validates every package before any repository or release is changed.
vp run release:prepare
asset_directory="$PWD/packages/obsidian/dist"
distribution_repo=markdown-confluence/obsidian-integration
source_repo=markdown-confluence/markdown-confluence
assets=(main.js manifest.json README.md LICENSE)
if [[ -f "$asset_directory/styles.css" ]]; then assets+=(styles.css); fi
comparison_directory=$(mktemp -d)
trap 'rm -rf "$comparison_directory"' EXIT

# A retry can add missing assets, but cannot replace a previously published file.
verify_existing_assets() {
  local repository=$1 tag=$2 metadata=$3 filename
  for filename in "${assets[@]}"; do
    if jq -e --arg name "$filename" 'any(.assets[]; .name == $name)' <<< "$metadata" >/dev/null; then
      gh release download "$tag" --repo "$repository" --pattern "$filename" --output "$comparison_directory/$filename" --clobber
      if ! cmp -s "$asset_directory/$filename" "$comparison_directory/$filename"; then
        echo "Published asset differs from the tagged build: $repository/$tag/$filename" >&2
        return 1
      fi
    fi
  done
}

upload_missing_assets() {
  local repository=$1 tag=$2 metadata=$3 filename
  for filename in "${assets[@]}"; do
    if ! jq -e --arg name "$filename" 'any(.assets[]; .name == $name)' <<< "$metadata" >/dev/null; then
      gh release upload "$tag" "$asset_directory/$filename" --repo "$repository"
    fi
  done
}

source_metadata=$(gh release view "$release_tag" --repo "$source_repo" --json assets)
verify_existing_assets "$source_repo" "$release_tag" "$source_metadata"
distribution_metadata='{"assets":[],"isDraft":true}'
distribution_exists=false
if existing_metadata=$(gh release view "$version" --repo "$distribution_repo" --json assets,isDraft); then
  distribution_metadata=$existing_metadata
  distribution_exists=true
  verify_existing_assets "$distribution_repo" "$version" "$distribution_metadata"
fi

if [[ "$distribution_exists" == false ]]; then
  node -e '
    const requested = require("./manifest.json").version.split(".").map(Number);
    const current = require("./.release-repo/manifest.json").version.split(".").map(Number);
    const differing = requested.findIndex((part, index) => part !== current[index]);
    if (differing >= 0 && requested[differing] < current[differing]) throw new Error("Refusing to downgrade the Obsidian distribution manifest");
  '
# Update only distribution metadata; preserve repository settings and history.
cp "$asset_directory/manifest.json" .release-repo/manifest.json
cp "$asset_directory/README.md" .release-repo/README.md
cp "$asset_directory/LICENSE" .release-repo/LICENSE
node --input-type=module <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('.release-repo/manifest.json', 'utf8'));
let versions = {};
try { versions = JSON.parse(await readFile('.release-repo/versions.json', 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
versions[manifest.version] = manifest.minAppVersion;
await writeFile('.release-repo/versions.json', JSON.stringify(versions, null, 2) + '\n');
JS

git -C .release-repo config user.name 'github-actions[bot]'
git -C .release-repo config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git -C .release-repo add manifest.json README.md LICENSE versions.json
if ! git -C .release-repo diff --cached --quiet; then
  git -C .release-repo commit -m "Release $version from $release_sha"
  git -C .release-repo push
fi
commit_sha=$(git -C .release-repo rev-parse HEAD)
  notes_file="$comparison_directory/release-notes.md"
  printf 'Built from [markdown-confluence %s](https://github.com/%s/commit/%s).\n\nSee the [release notes](https://github.com/%s/releases/tag/%s).\n' \
    "$version" "$source_repo" "$release_sha" "$source_repo" "$release_tag" > "$notes_file"
  gh release create "$version" --repo "$distribution_repo" --title "$version" --notes-file "$notes_file" --target "$commit_sha" --draft
fi
upload_missing_assets "$source_repo" "$release_tag" "$source_metadata"
upload_missing_assets "$distribution_repo" "$version" "$distribution_metadata"
if [[ "$(jq -r '.isDraft' <<< "$distribution_metadata")" == true ]]; then
  latest=$(node -p '
    const requested = require("./manifest.json").version.split(".").map(Number);
    const current = require("./.release-repo/manifest.json").version.split(".").map(Number);
    const differing = requested.findIndex((part, index) => part !== current[index]);
    differing < 0 || requested[differing] > current[differing]
  ')
  gh release edit "$version" --repo "$distribution_repo" --draft=false --latest="$latest"
fi
