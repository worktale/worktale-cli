import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  installPostCommitHook,
  installPostPushHook,
  isHookInstalled,
  removeHooks,
} from '../../src/git/hooks.js';

/*
 * These tests create a fake .git/hooks directory in a temporary folder
 * to avoid touching real repos.
 */

let repoPath: string;
let hooksDir: string;

beforeEach(() => {
  repoPath = mkdtempSync(join(tmpdir(), 'worktale-hooks-'));
  hooksDir = join(repoPath, '.git', 'hooks');
  // Do NOT pre-create .git/hooks — some tests verify it is created automatically
});

afterEach(() => {
  rmSync(repoPath, { recursive: true, force: true });
});

// ---------- installPostCommitHook ----------

describe('installPostCommitHook', () => {
  it('creates the hook file when none exists', () => {
    installPostCommitHook(repoPath);

    const hookPath = join(hooksDir, 'post-commit');
    expect(existsSync(hookPath)).toBe(true);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain('worktale');
  });

  it('creates .git/hooks directory if missing', () => {
    expect(existsSync(hooksDir)).toBe(false);
    installPostCommitHook(repoPath);
    expect(existsSync(hooksDir)).toBe(true);
  });

  it('creates the PowerShell hook alongside the bash hook', () => {
    installPostCommitHook(repoPath);

    const ps1Path = join(hooksDir, 'post-commit.ps1');
    expect(existsSync(ps1Path)).toBe(true);
    const content = readFileSync(ps1Path, 'utf-8');
    expect(content).toContain('worktale');
    expect(content).toContain('capture');
  });

  it('appends to an existing hook without overwriting', () => {
    mkdirSync(hooksDir, { recursive: true });
    const hookPath = join(hooksDir, 'post-commit');
    const existingContent = '#!/bin/sh\necho "existing hook"\n';
    writeFileSync(hookPath, existingContent, 'utf-8');

    installPostCommitHook(repoPath);

    const content = readFileSync(hookPath, 'utf-8');
    // Original content preserved
    expect(content).toContain('echo "existing hook"');
    // Worktale section appended
    expect(content).toContain('worktale capture');
    expect(content).toContain('# --- Worktale hook start ---');
    expect(content).toContain('# --- Worktale hook end ---');
  });

  it('is idempotent (double install does not duplicate)', () => {
    installPostCommitHook(repoPath);
    const firstContent = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');

    installPostCommitHook(repoPath);
    const secondContent = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');

    expect(secondContent).toBe(firstContent);
  });

  it('does not overwrite existing hook that already has worktale', () => {
    mkdirSync(hooksDir, { recursive: true });
    const hookPath = join(hooksDir, 'post-commit');
    const content = '#!/bin/sh\necho "custom"\n# worktale was already here\n';
    writeFileSync(hookPath, content, 'utf-8');

    installPostCommitHook(repoPath);

    const result = readFileSync(hookPath, 'utf-8');
    // Should not have modified it since 'worktale' is already present
    expect(result).toBe(content);
  });
});

// ---------- installPostPushHook ----------

describe('installPostPushHook', () => {
  it('creates the post-push hook when none exists', () => {
    installPostPushHook(repoPath);

    const hookPath = join(hooksDir, 'post-push');
    expect(existsSync(hookPath)).toBe(true);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('#!/bin/sh');
    expect(content).toContain('worktale digest');
  });

  it('appends to an existing post-push hook', () => {
    mkdirSync(hooksDir, { recursive: true });
    const hookPath = join(hooksDir, 'post-push');
    const existing = '#!/bin/sh\necho "push done"\n';
    writeFileSync(hookPath, existing, 'utf-8');

    installPostPushHook(repoPath);

    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('echo "push done"');
    expect(content).toContain('worktale digest');
  });

  it('is idempotent (double install does not duplicate)', () => {
    installPostPushHook(repoPath);
    const first = readFileSync(join(hooksDir, 'post-push'), 'utf-8');

    installPostPushHook(repoPath);
    const second = readFileSync(join(hooksDir, 'post-push'), 'utf-8');

    expect(second).toBe(first);
  });
});

// ---------- isHookInstalled ----------

describe('isHookInstalled', () => {
  it('returns false when hook file does not exist', () => {
    expect(isHookInstalled(repoPath, 'post-commit')).toBe(false);
  });

  it('returns false when hook exists but has no worktale content', () => {
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, 'post-commit'), '#!/bin/sh\necho "hi"\n', 'utf-8');
    expect(isHookInstalled(repoPath, 'post-commit')).toBe(false);
  });

  it('returns true when hook contains worktale content', () => {
    installPostCommitHook(repoPath);
    expect(isHookInstalled(repoPath, 'post-commit')).toBe(true);
  });

  it('detects post-push hooks', () => {
    installPostPushHook(repoPath);
    expect(isHookInstalled(repoPath, 'post-push')).toBe(true);
  });
});

// ---------- removeHooks ----------

describe('removeHooks', () => {
  it('removes worktale-only hooks entirely', () => {
    installPostCommitHook(repoPath);
    installPostPushHook(repoPath);

    expect(existsSync(join(hooksDir, 'post-commit'))).toBe(true);
    expect(existsSync(join(hooksDir, 'post-push'))).toBe(true);

    removeHooks(repoPath);

    // Hooks that were entirely ours should be removed
    expect(isHookInstalled(repoPath, 'post-commit')).toBe(false);
    expect(isHookInstalled(repoPath, 'post-push')).toBe(false);
  });

  it('removes the PowerShell hook file', () => {
    installPostCommitHook(repoPath);
    const ps1Path = join(hooksDir, 'post-commit.ps1');
    expect(existsSync(ps1Path)).toBe(true);

    removeHooks(repoPath);
    expect(existsSync(ps1Path)).toBe(false);
  });

  it('preserves non-worktale content when removing from a shared hook', () => {
    mkdirSync(hooksDir, { recursive: true });
    const hookPath = join(hooksDir, 'post-commit');

    // Create a hook with both custom and worktale content
    const customContent = `#!/bin/sh
echo "my custom step"
# --- Worktale hook start ---
worktale capture --silent 2>/dev/null || true
# --- Worktale hook end ---
`;
    writeFileSync(hookPath, customContent, 'utf-8');

    removeHooks(repoPath);

    // The file should still exist with custom content
    expect(existsSync(hookPath)).toBe(true);
    const remaining = readFileSync(hookPath, 'utf-8');
    expect(remaining).toContain('echo "my custom step"');
    expect(remaining).not.toContain('worktale capture');
    expect(remaining).not.toContain('Worktale hook start');
  });

  it('is safe to call when no hooks exist', () => {
    // Should not throw
    expect(() => removeHooks(repoPath)).not.toThrow();
  });

  it('is safe to call when hooks exist but have no worktale content', () => {
    mkdirSync(hooksDir, { recursive: true });
    const hookPath = join(hooksDir, 'post-commit');
    writeFileSync(hookPath, '#!/bin/sh\necho "unrelated"\n', 'utf-8');

    removeHooks(repoPath);

    // File should be untouched
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('echo "unrelated"');
  });
});
