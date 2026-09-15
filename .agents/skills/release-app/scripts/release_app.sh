#!/bin/bash

# release_app.sh
# Automates the release process:
# 1. Commits the changes
# 2. Tags the release (with release notes)
# 3. Pushes to origin

set -e

CURRENT_VERSION=$(grep '"version"' chrome-extension/manifest.json | awk -F '"' '{print $4}')

if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Could not read version from manifest.json"
    exit 1
fi

TAG_NAME="v$CURRENT_VERSION"
echo "Releasing Version: $TAG_NAME"

git add .
git commit -m "Release $TAG_NAME"

# Extract release notes for the new version from RELEASE_NOTES.md
# Looks for the section starting with "## vCURRENT_VERSION" and stops at the next "## v"
RELEASE_NOTES=$(awk "/^## v$CURRENT_VERSION/ {flag=1; next} /^## v/ {flag=0} flag" RELEASE_NOTES.md | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')

if [ -n "$RELEASE_NOTES" ]; then
    git tag -a "$TAG_NAME" -m "Release $TAG_NAME" -m "$RELEASE_NOTES"
    echo "Commited and tagged: $TAG_NAME with release notes."
else
    git tag "$TAG_NAME"
    echo "Commited and tagged: $TAG_NAME (no release notes found in RELEASE_NOTES.md)."
fi

echo "Pushing to origin..."
git push origin main
git push origin "$TAG_NAME"

echo "Release $CURRENT_VERSION completed successfully!"
