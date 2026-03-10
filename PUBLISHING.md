# Publishing @corpus-relica/reflex-devtools

## Local Development (Verdaccio)

Uses the shared Verdaccio instance from `systema-relica-sdk` so all `@corpus-relica/*` packages resolve from one local registry.

### Prerequisites

1. Verdaccio running on `http://localhost:4873` (start from SDK repo: `yarn local-registry`)
2. Local user created: `npm adduser --registry http://localhost:4873`

### Publish to Verdaccio

```bash
# Bump version
./scripts/bump-version.sh 0.2.0

# Build and publish to local registry
npm run publish:local
```

### Consuming projects

```bash
# Point scope at Verdaccio (if not already)
npm config set @corpus-relica:registry http://localhost:4873

# Install
npm install @corpus-relica/reflex-devtools@0.2.0
```

## Release to npm (Public)

For CD-compatible deployments where Verdaccio isn't available.

### Prerequisites

1. npm account with publish access to `@corpus-relica` scope
2. Logged in: `npm login`

### Publish

```bash
# Bump version
./scripts/bump-version.sh 0.2.0

# Publish to npm (handles scope swap, build, browser auth, and restore)
npm run publish:remote

# Tag the release
git add package.json package-lock.json
git commit -m "v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push && git push --tags
```

The `publish:remote` script (`scripts/publish-npm.sh`) temporarily swaps `@corpus-relica` scope from Verdaccio to npmjs.org, publishes, then restores — even if publish fails.

## Troubleshooting

**"Cannot publish over existing version"** — Bump version first: `./scripts/bump-version.sh X.Y.Z`

**"ECONNREFUSED localhost:4873"** — Start Verdaccio: `cd ../systema-relica-sdk && yarn local-registry`

**"need auth"** — Create Verdaccio user: `npm adduser --registry http://localhost:4873`

**"You must sign up for private packages"** — The `publishConfig.access: "public"` in package.json should handle this. If not, use `npm publish --access public`.
