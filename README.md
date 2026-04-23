# @lambda-script/vite-plugin-worktree-hmr

> Vite plugin fixing HMR when the project root lives under a hardcoded-ignored path like `.git/worktree/feature-*`.

[![npm version](https://img.shields.io/npm/v/@lambda-script/vite-plugin-worktree-hmr.svg)](https://www.npmjs.com/package/@lambda-script/vite-plugin-worktree-hmr)
[![License](https://img.shields.io/npm/l/@lambda-script/vite-plugin-worktree-hmr.svg)](./LICENSE)
[![CI](https://github.com/lambda-script/vite-plugin-worktree-hmr/actions/workflows/ci.yml/badge.svg)](https://github.com/lambda-script/vite-plugin-worktree-hmr/actions/workflows/ci.yml)

📖 [日本語版 README](./README.ja.md)

## Why you might need this

Run any of these and HMR silently breaks — save a `.tsx`, nothing happens, you're forced to full-reload:

- You use `git worktree add .git/worktree/feature-x ...` to keep worktrees inside `.git/` so your filesystem stays clean.
- You run a parallel AI coding agent (Claude Code, dmux, `git-worktree-manager`, etc.) that places worktrees under `.git/worktree/` by convention.
- Your source files happen to live under a path segment named `.git` for any other reason.

### Root cause

Vite 6+ hardcodes `**/.git/**` into its chokidar `ignored` option ([source][vite-hardcode]). chokidar's `ignored` is OR-semantic — if any pattern matches, the file is filtered. Setting `server.watch.ignored` in `vite.config.ts` cannot remove the hardcoded default. The documented `'!**/path/**'` negation workaround does **not** produce working HMR ([evidence: vitejs/vite#21045][issue-21045]).

Vite maintainers consider the hardcoded ignore "expected behavior." Related upstream issues have been open for years (e.g., [#8619][issue-8619] since 2022).

### How this plugin fixes it

Runs a **sidecar chokidar watcher** with `cwd: root`, so relative ignore patterns are cwd-normalized. The sidecar sees files the built-in watcher filters out, and forwards events to `server.watcher.emit(...)` — feeding Vite's existing HMR pipeline without patching any Vite internals.

```
┌──────────── vite dev server ────────────┐
│                                          │
│  server.watcher ← .git/** hardcoded ignore│
│      ▲                                   │
│      │ emit('change' | 'add' | ...)      │
│                                          │
│  ┌────────────────────────────────┐     │
│  │ Sidecar chokidar (cwd: root)   │     │
│  │ — not fooled by .git/ prefix   │     │
│  └────────────────────────────────┘     │
└──────────────────────────────────────────┘
```

## Install

```sh
# pnpm
pnpm add -D @lambda-script/vite-plugin-worktree-hmr

# npm
npm install --save-dev @lambda-script/vite-plugin-worktree-hmr

# yarn
yarn add -D @lambda-script/vite-plugin-worktree-hmr
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import worktreeHmr from '@lambda-script/vite-plugin-worktree-hmr'

export default defineConfig({
  plugins: [worktreeHmr()],
})
```

That's it. The plugin is a no-op unless your Vite root contains a `.git` segment.

On dev-server startup you will see one of:

- `[vite-plugin-worktree-hmr] enabled (root is inside .git/, using sidecar chokidar watcher)`
- `[vite-plugin-worktree-hmr] skipped (root is not inside .git/)`
- `[vite-plugin-worktree-hmr] disabled by DISABLE_WORKTREE_HMR_FIX=1`

## Environment variables

| Variable | Effect |
|---|---|
| `DISABLE_WORKTREE_HMR_FIX=1` | Disable the plugin entirely (escape hatch) |
| `WORKTREE_HMR_POLLING=1` | Force polling on the sidecar (for Docker / NFS / network filesystems where FSEvents or inotify are unavailable) |

The sidecar also inherits `server.watch.usePolling` / `server.watch.interval` from your Vite config if set, so most Docker users already get polling automatically.

## Compatibility

- **Vite:** 5, 6, 7, 8 (declared as peer dependency)
- **Node:** 20+
- **chokidar:** 3 or 4 (auto-resolved via peer/runtime deps)
- **OS:** macOS, Linux. Windows/WSL should work (path check is slash-agnostic) but is not continuously verified — please file an issue if you hit problems.

## Design choices

- **No Vite internal patching.** The only integration point is `server.watcher.emit(...)`, which is a standard Node EventEmitter API. Works across Vite major versions.
- **No duplicate HMR firing.** Vite's built-in watcher still runs but ignores `.git/**` paths, so it emits nothing for worktree files. The sidecar is the sole source of events for these files.
- **Idempotent shutdown.** Wired to both `httpServer 'close'` and `server.close` so normal Ctrl+C and `server.restart()` both clean up the sidecar.
- **Errors never crash the dev server.** All `emit` and `close` calls are wrapped in try/catch and logged via `logger.error`.

## License

[MIT](./LICENSE) © LambdaScript

[vite-hardcode]: https://github.com/vitejs/vite/blob/v6.3.5/packages/vite/src/node/watch.ts
[issue-21045]: https://github.com/vitejs/vite/issues/21045
[issue-8619]: https://github.com/vitejs/vite/issues/8619
