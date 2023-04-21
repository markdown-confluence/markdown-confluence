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

cd packages/obsidian

FILES=$(echo dist/*)
gh release create $TAG -t $TAG --generate-notes --latest --target $SHA ./dist/*
echo $FILES

cd $ORIGINAL_PATH
./.build/sign-release $TAG
