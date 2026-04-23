# CLAUDE.md

Agent guidance for this repository.

## What this is

A single-purpose Vite plugin: run a sidecar chokidar watcher when the Vite root sits under a hardcoded-ignored path (most commonly `.git/worktree/feature-*`) so HMR keeps working.

## Quickstart

```sh
pnpm install
pnpm check        # biome lint + format check
pnpm test         # vitest unit tests
pnpm build        # tsup (ESM + CJS + .d.ts)
```

All four must pass before committing.

## Conventions

- **Commits follow [Conventional Commits](https://www.conventionalcommits.org/).** `release-please` relies on this for version bumping and changelog generation.
- **Biome is the single source of truth** for formatting and linting. Do not add prettier or eslint.
- **Node 20+**. Do not depend on newer Node APIs without bumping `engines` and peer peer-compatibility.
- **No runtime dependencies beyond `chokidar`.** `vite` is a peer.
- **Tests live in `tests/`, not alongside source.** Vitest picks them up via `vitest.config.ts`.

## Release flow

1. Commits land on `main` following Conventional Commits.
2. `release-please` opens/updates a release PR.
3. Maintainer merges the release PR → tag + GitHub Release created.
4. The `publish.yml` workflow runs on release creation and runs `npm publish` using `NPM_TOKEN`.

## Do not

- Add features that expand scope beyond the README description without opening an issue first.
- Bump chokidar major without verifying the plugin still works on the oldest supported Vite major.
- Touch `server.watcher` internals beyond `.emit(...)` — that is the only stable integration point.
