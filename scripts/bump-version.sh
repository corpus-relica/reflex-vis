#!/bin/bash
set -e

# Usage: ./scripts/bump-version.sh <version>
# Examples:
#   ./scripts/bump-version.sh 0.2.0
#   ./scripts/bump-version.sh 1.0.0

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  echo ""
  echo "Examples:"
  echo "  ./scripts/bump-version.sh 0.2.0"
  echo "  ./scripts/bump-version.sh 1.0.0"
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Invalid version format. Expected X.Y.Z"
  exit 1
fi

echo "Bumping to $VERSION..."

sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json
echo "  Updated package.json"

npm install --silent --package-lock-only 2>/dev/null || true
echo "  Updated lockfile"

echo ""
echo "Done. Next steps:"
echo "  1. Build:   npm run build"
echo "  2. Publish:"
echo "     Local:   npm run publish:local"
echo "     npm:     npm publish"
