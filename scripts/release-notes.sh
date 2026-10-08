#!/usr/bin/env bash
set -euo pipefail

tag="${1:?usage: scripts/release-notes.sh <tag>}"
version="${tag#v}"

if [ "$(git cat-file -t "$tag" 2>/dev/null)" != "tag" ]; then
  echo "error: $tag is not an annotated tag; create it with: git tag -a $tag -F notes.txt" >&2
  exit 1
fi

package_version=$(node -p "require('./package.json').version")
cargo_version=$(sed -n 's/^version = "\(.*\)"$/\1/p' src-tauri/Cargo.toml | head -n 1)
if [ "$package_version" != "$version" ] || [ "$cargo_version" != "$version" ]; then
  echo "error: $tag does not match package.json ($package_version) and src-tauri/Cargo.toml ($cargo_version)" >&2
  exit 1
fi

contents=$(git for-each-ref --format='%(contents)' "refs/tags/$tag")
signature=$(git for-each-ref --format='%(contents:signature)' "refs/tags/$tag")
message=${contents%"$signature"}
notes=$(printf '%s\n' "$message" | grep -v '^[[:space:]]*$' || true)

if [ -z "$notes" ] || printf '%s\n' "$notes" | grep -qv '^- '; then
  echo "error: every non-empty line of the $tag message must be a \"- \" bullet, got:" >&2
  printf '%s\n' "$message" >&2
  exit 1
fi

printf '%s\n' "$notes"
