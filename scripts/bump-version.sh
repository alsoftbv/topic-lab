#!/bin/zsh
set -e

cd "$(dirname "$0")/.."

LATEST_TAG=$(git tag --sort=-v:refname | head -1)
if [[ -z $LATEST_TAG ]]; then
    CURRENT="0.0.0"
else
    CURRENT=${LATEST_TAG#v}
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
SUGGESTED="$MAJOR.$MINOR.$((PATCH + 1))"

if [[ -n $1 ]]; then
    VERSION=$1
else
    echo "Current version: $CURRENT"
    echo ""
    vared -p "Update to: " SUGGESTED
    VERSION=$SUGGESTED
fi

if [[ -z $VERSION ]]; then
    echo "Aborted"
    exit 0
fi

if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid version format: $VERSION"
    exit 1
fi

if git tag -l "v$VERSION" | grep -q .; then
    echo "Tag v$VERSION already exists"
    exit 1
fi

echo ""
echo "Updating package.json..."
npm pkg set version="$VERSION"

echo "Updating package-lock.json..."
npm install --package-lock-only --silent

echo "Updating Cargo.toml..."
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml

echo "Updating Cargo.lock..."
(cd src-tauri && cargo update -p mqtt-topic-lab --quiet 2>/dev/null || cargo generate-lockfile --quiet)

echo ""
echo "Done! Updated to v$VERSION"
echo "Commit, then create an annotated tag whose message is the \"- \" bullet release notes:"
echo "  git tag -a v$VERSION -F notes.txt && scripts/release-notes.sh v$VERSION"
