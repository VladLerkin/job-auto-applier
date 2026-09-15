#!/bin/bash

# up_version.sh
# Bumps the version in manifest.json and package.json

set -e

# Extract current version from manifest.json
CURRENT_VERSION=$(grep '"version"' chrome-extension/manifest.json | awk -F '"' '{print $4}')

if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Could not read version from manifest.json"
    exit 1
fi

# Calculate new version (bump PATCH)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
if [ -z "$PATCH" ]; then
    PATCH=0
fi
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"

# Update manifest.json (macOS sed)
sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" chrome-extension/manifest.json

# Update package.json (macOS sed)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" agent-server/package.json

echo "Bumped version to $NEW_VERSION"
