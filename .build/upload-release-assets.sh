#!/bin/bash

ORIGINAL_TAG="$1"
SHA="$2"

ORIGINAL_PATH=$PWD

mkdir -p packages/obsidian/dist/
cp README.md packages/obsidian/dist/
cp manifest.json packages/obsidian/dist/

npm ci
npm run lint -ws --if-present
npm run prettier-check -ws --if-present
npm run build -ws --if-present

IFS='-v' read -ra PARTS <<< "$ORIGINAL_TAG"
TAG="${PARTS[-1]}"
echo "CurrentVersion=$TAG" >> "$GITHUB_OUTPUT"

cd packages/obsidian

FILES=$(echo dist/*)
gh release create $TAG -R markdown-confluence/obsidian-integration -t $TAG --generate-notes --latest --target $SHA ./dist/*
echo $FILES

cd $ORIGINAL_PATH

git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com

cp manifest.json ./.release-repo/manifest.json
cd ./.release-repo
git add manifest.json
git commit -m "Update manifest for $TAG release."
git push
