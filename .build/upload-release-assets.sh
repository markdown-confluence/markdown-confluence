#!/bin/bash

ORIGINAL_PATH=$PWD

git config --global user.name "andymac4182"
git config --global user.email "andrew.mcclenaghan@gmail.com"

cp manifest.json ./.release-repo/manifest.json
cp -r ./packages/obsidian ./.release-repo
cd ./.release-repo
git add .
git commit -m "Update manifest for $TAG release."
commit_sha=$(git rev-parse HEAD)
git push

cd $ORIGINAL_PATH

ORIGINAL_TAG="$1"
SHA="$2"

IFS='-v' read -ra PARTS <<< "$ORIGINAL_TAG"
TAG="${PARTS[-1]}"
echo "CurrentVersion=$TAG" >> "$GITHUB_OUTPUT"

mkdir -p packages/obsidian/dist/
cp README.md packages/obsidian/dist/
cp manifest.json packages/obsidian/dist/

npm ci
npm run lint -ws --if-present
npm run prettier-check -ws --if-present
npm run build -ws --if-present

cd packages/obsidian

FILES=$(echo dist/*)
gh release create $TAG -R markdown-confluence/obsidian-integration -t $TAG --generate-notes --latest --target $commit_sha ./dist/*
echo $FILES

cd $ORIGINAL_PATH

