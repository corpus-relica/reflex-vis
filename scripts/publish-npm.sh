#!/bin/bash
set -e

# Publish to public npm registry.
# Temporarily swaps @corpus-relica scope from Verdaccio to npmjs.org,
# runs npm publish (which opens browser for auth), then restores scope.

ORIGINAL=$(npm config get @corpus-relica:registry 2>/dev/null || echo "")

restore() {
  if [ -n "$ORIGINAL" ]; then
    npm config set @corpus-relica:registry "$ORIGINAL"
    echo "Restored @corpus-relica:registry → $ORIGINAL"
  fi
}
trap restore EXIT

echo "Building..."
npm run clean && npm run build

echo ""
echo "Switching @corpus-relica scope to npmjs.org..."
npm config set @corpus-relica:registry https://registry.npmjs.org

echo "Publishing (browser auth may open)..."
npm publish --ignore-scripts

echo ""
echo "Published @corpus-relica/reflex-devtools@$(node -p "require('./package.json').version")"
