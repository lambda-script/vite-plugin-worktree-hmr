import { describe, expect, it } from 'vitest'

import gitWorktreeHmr, { isDisabled, isInsideGitDir, shouldUsePolling } from '../src/index'

describe('isInsideGitDir', () => {
  it('returns true when POSIX path contains .git segment', () => {
    expect(isInsideGitDir('/Users/a/project/.git/worktree/feature-x/app')).toBe(true)
  })

  it('returns false when POSIX path has no .git segment', () => {
    expect(isInsideGitDir('/Users/a/project/app')).toBe(false)
  })

  it('returns true for Windows-style path (backslashes)', () => {
    expect(isInsideGitDir('C:\\Users\\a\\project\\.git\\worktree\\feature-x')).toBe(true)
  })

  it('returns true when Vite normalizes Windows path to forward slashes', () => {
    expect(isInsideGitDir('C:/Users/a/project/.git/worktree/feature-x')).toBe(true)
  })

  it('returns false when path only contains "git" (no dot prefix)', () => {
    expect(isInsideGitDir('/Users/a/project/git/assets')).toBe(false)
  })

  it('returns false for a substring-only match like .gitignore', () => {
    expect(isInsideGitDir('/Users/a/project/.gitignore/foo')).toBe(false)
  })
})

describe('isDisabled', () => {
  it('returns true when DISABLE_WORKTREE_HMR_FIX=1', () => {
    expect(isDisabled({ DISABLE_WORKTREE_HMR_FIX: '1' })).toBe(true)
  })

  it('returns false when variable is unset', () => {
    expect(isDisabled({})).toBe(false)
  })

  it('returns false for other truthy-looking values', () => {
    expect(isDisabled({ DISABLE_WORKTREE_HMR_FIX: 'true' })).toBe(false)
    expect(isDisabled({ DISABLE_WORKTREE_HMR_FIX: 'yes' })).toBe(false)
    expect(isDisabled({ DISABLE_WORKTREE_HMR_FIX: '0' })).toBe(false)
  })
})

describe('shouldUsePolling', () => {
  it('returns true when WORKTREE_HMR_POLLING=1', () => {
    expect(shouldUsePolling({ WORKTREE_HMR_POLLING: '1' })).toBe(true)
  })

  it('returns false when variable is unset', () => {
    expect(shouldUsePolling({})).toBe(false)
  })

  it('returns false for other truthy-looking values', () => {
    expect(shouldUsePolling({ WORKTREE_HMR_POLLING: 'true' })).toBe(false)
  })
})

describe('gitWorktreeHmr', () => {
  it('returns a Vite plugin with the expected shape', () => {
    const plugin = gitWorktreeHmr()
    expect(plugin).toMatchObject({
      name: 'vite-plugin-worktree-hmr',
      apply: 'serve',
    })
    expect(typeof plugin.configureServer).toBe('function')
  })

  it('returns a fresh plugin instance per call', () => {
    const a = gitWorktreeHmr()
    const b = gitWorktreeHmr()
    expect(a).not.toBe(b)
  })
})
