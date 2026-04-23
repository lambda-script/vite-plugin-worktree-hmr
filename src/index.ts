import * as path from 'node:path'
import chokidar from 'chokidar'

import type { Plugin, ViteDevServer } from 'vite'

const LOG_PREFIX = '[vite-plugin-worktree-hmr]'

type ForwardEvent = 'change' | 'add' | 'unlink' | 'addDir' | 'unlinkDir'

const FORWARD_EVENTS: ForwardEvent[] = ['change', 'add', 'unlink', 'addDir', 'unlinkDir']

/**
 * Returns true when `root` contains a path segment equal to `.git`.
 *
 * Splits on both `/` and `\\` because Vite normalizes `server.config.root` to
 * forward slashes on Windows even when `path.sep` is a backslash.
 */
export function isInsideGitDir(root: string): boolean {
  return root.split(/[\\/]/).includes('.git')
}

/** Returns true when the plugin is disabled via environment variable. */
export function isDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DISABLE_WORKTREE_HMR_FIX === '1'
}

/** Returns true when polling is forced on via environment variable. */
export function shouldUsePolling(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WORKTREE_HMR_POLLING === '1'
}

/**
 * Vite plugin that fixes HMR when the project root lives under a hardcoded
 * chokidar-ignored path (most commonly `.git/worktree/feature-*`).
 *
 * Vite 6+ prepends `**\/.git/**` to its chokidar `ignored` option. When the
 * worktree is placed inside `.git/`, file changes are never reported and HMR
 * silently breaks. This plugin runs a sidecar chokidar watcher scoped to the
 * Vite root (via `cwd: root` so ignore patterns are cwd-normalized) and
 * forwards file events to `server.watcher.emit(...)`, feeding Vite's existing
 * HMR pipeline without patching Vite internals.
 *
 * Environment variables:
 * - `DISABLE_WORKTREE_HMR_FIX=1` — disable the plugin entirely
 * - `WORKTREE_HMR_POLLING=1` — force polling (for Docker/network filesystems
 *   where FSEvents/inotify are unavailable)
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import worktreeHmr from '@lambda-script/vite-plugin-worktree-hmr'
 *
 * export default defineConfig({
 *   plugins: [worktreeHmr()],
 * })
 * ```
 */
export default function gitWorktreeHmr(): Plugin {
  return {
    name: 'vite-plugin-worktree-hmr',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const logger = server.config.logger
      const root = server.config.root

      if (isDisabled()) {
        logger.info(`${LOG_PREFIX} disabled by DISABLE_WORKTREE_HMR_FIX=1`)
        return
      }

      if (!isInsideGitDir(root)) {
        logger.info(`${LOG_PREFIX} skipped (root is not inside .git/)`)
        return
      }

      logger.info(`${LOG_PREFIX} enabled (root is inside .git/, using sidecar chokidar watcher)`)

      const viteWatchOptions = server.config.server.watch

      const sidecar = chokidar.watch('.', {
        cwd: root,
        ignored: [
          '**/node_modules/**',
          '.git', // worktree root .git pointer file (plain file, not a directory)
          '**/.git/**', // defense-in-depth for any nested .git dirs (submodules, fixtures)
          '**/dist/**',
          '**/.vite/**',
        ],
        ignoreInitial: true,
        ignorePermissionErrors: true,
        usePolling: shouldUsePolling() || viteWatchOptions?.usePolling === true,
        interval: viteWatchOptions?.interval,
      })

      const forward = (event: ForwardEvent, relPath: string) => {
        const absPath = path.resolve(root, relPath)
        try {
          server.watcher.emit(event, absPath)
        } catch (err) {
          logger.error(`${LOG_PREFIX} emit failed: ${String(err)}`)
        }
      }

      for (const event of FORWARD_EVENTS) {
        sidecar.on(event, (relPath: string) => forward(event, relPath))
      }

      sidecar.on('error', (err) => {
        logger.error(`${LOG_PREFIX} sidecar watcher error: ${String(err)}`)
      })

      server.httpServer?.on('close', () => {
        void sidecar.close()
      })

      const originalClose = server.close.bind(server)
      server.close = async () => {
        try {
          await sidecar.close()
        } catch (err) {
          logger.error(`${LOG_PREFIX} sidecar.close() failed: ${String(err)}`)
        }
        return originalClose()
      }
    },
  }
}
