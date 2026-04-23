# @lambda-script/vite-plugin-worktree-hmr

> プロジェクトルートが `.git/worktree/feature-*` のような「Vite がハードコードで ignore するパス」の配下にあっても HMR を効かせる Vite プラグイン。

[![npm version](https://img.shields.io/npm/v/@lambda-script/vite-plugin-worktree-hmr.svg)](https://www.npmjs.com/package/@lambda-script/vite-plugin-worktree-hmr)
[![License](https://img.shields.io/npm/l/@lambda-script/vite-plugin-worktree-hmr.svg)](./LICENSE)
[![CI](https://github.com/lambda-script/vite-plugin-worktree-hmr/actions/workflows/ci.yml/badge.svg)](https://github.com/lambda-script/vite-plugin-worktree-hmr/actions/workflows/ci.yml)

📖 [English README](./README.md)

## こんなときに必要

以下のどれかに当てはまると HMR がサイレントに壊れます（`.tsx` を保存しても反映されず、フルリロード必須）。

- ファイルシステムを汚したくなくて `git worktree add .git/worktree/feature-x ...` で worktree を `.git/` 配下に置いている
- Claude Code、dmux、`git-worktree-manager` など、AI エージェント並列開発ツールが `.git/worktree/` を既定の配置場所に使っている
- 何らかの理由でソースファイルが `.git` という名前のパスセグメントの下にある

### 根本原因

Vite 6+ は chokidar の `ignored` オプションに `**/.git/**` を **ハードコードで prepend** します（[該当実装][vite-hardcode]）。chokidar の `ignored` は OR セマンティクス（どれか 1 つマッチしたら ignore）のため、`vite.config.ts` で何を渡しても既定値を外せません。ドキュメントに書かれている `'!**/path/**'` の negation ワークアラウンドは、**chokidar レベルではイベントが流れても HMR 発火まで届かない**という報告があります（[vitejs/vite#21045][issue-21045]）。

Vite メンテナはこの挙動を "expected behavior" として扱っており、関連する上流 issue（[#8619][issue-8619] など）は 4 年以上 open のままです。

### 本プラグインの解決アプローチ

**`cwd: root` を指定したサイドカー chokidar watcher** を別個に立ち上げます。`cwd` を指定すると chokidar は ignore パターンを cwd 相対に正規化するため、Vite 既定の `**/.git/**` のような「絶対パス起点でマッチする」既定値に引っかからず、worktree 配下のファイルを普通に watch できます。検知したイベントは `server.watcher.emit(...)` で Vite 既存の HMR パイプラインに流し込むだけ — Vite 内部には一切パッチを当てません。

```
┌─────────── vite dev server ────────────┐
│                                          │
│  server.watcher ← .git/** をハードコード ignore │
│      ▲                                   │
│      │ emit('change' | 'add' | ...)      │
│                                          │
│  ┌────────────────────────────────┐     │
│  │ サイドカー chokidar (cwd: root)│     │
│  │ — .git/ prefix に誤マッチしない │     │
│  └────────────────────────────────┘     │
└──────────────────────────────────────────┘
```

## インストール

```sh
# pnpm
pnpm add -D @lambda-script/vite-plugin-worktree-hmr

# npm
npm install --save-dev @lambda-script/vite-plugin-worktree-hmr

# yarn
yarn add -D @lambda-script/vite-plugin-worktree-hmr
```

## 使い方

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import worktreeHmr from '@lambda-script/vite-plugin-worktree-hmr'

export default defineConfig({
  plugins: [worktreeHmr()],
})
```

これだけです。Vite root に `.git` セグメントが含まれていない場合は no-op になります（本体リポで走らせても副作用ゼロ）。

dev server 起動時に以下のいずれかが出力されます:

- `[vite-plugin-worktree-hmr] enabled (root is inside .git/, using sidecar chokidar watcher)`
- `[vite-plugin-worktree-hmr] skipped (root is not inside .git/)`
- `[vite-plugin-worktree-hmr] disabled by DISABLE_WORKTREE_HMR_FIX=1`

## 環境変数

| 変数 | 効果 |
|---|---|
| `DISABLE_WORKTREE_HMR_FIX=1` | プラグインを完全に無効化（緊急時回避） |
| `WORKTREE_HMR_POLLING=1` | サイドカーを強制 polling モードに切替（Docker / NFS / ネットワーク FS 等で FSEvents や inotify が使えない環境向け） |

サイドカーは Vite 本体の `server.watch.usePolling` / `server.watch.interval` も継承するため、Docker 前提の設定をしていれば通常は自動で polling 側に切り替わります。

## 動作環境

- **Vite:** 5, 6, 7, 8（peer dependency）
- **Node:** 20+
- **chokidar:** 3 または 4
- **OS:** macOS, Linux 動作確認。Windows/WSL はスラッシュ両対応していますが継続検証できていないため、問題があれば issue 立ててください

## 設計判断

- **Vite 内部にパッチしない**: 接面は `server.watcher.emit(...)` のみ（標準 EventEmitter API）。Vite のメジャー変更にも壊れにくい
- **HMR の二重発火なし**: Vite 既存 watcher は `.git/**` 既定 ignore で worktree 配下のファイルを emit しないため、サイドカーが唯一のイベントソースになる
- **冪等なシャットダウン**: `httpServer 'close'` と `server.close` の両方にフック。通常の Ctrl+C と `server.restart()` どちらのパスでもサイドカーが確実に閉じる
- **エラーで dev server を落とさない**: `emit`・`close` すべて try/catch で `logger.error` に流す

## ライセンス

[MIT](./LICENSE) © LambdaScript

[vite-hardcode]: https://github.com/vitejs/vite/blob/v6.3.5/packages/vite/src/node/watch.ts
[issue-21045]: https://github.com/vitejs/vite/issues/21045
[issue-8619]: https://github.com/vitejs/vite/issues/8619
