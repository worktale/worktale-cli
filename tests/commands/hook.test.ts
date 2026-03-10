import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

// Mock DB — hook install now calls getRepo/addRepo so we need a real test DB
vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Import after mocks
import { hookCommand } from '../../src/commands/hook.js';
import { isHookInstalled, removeHooks } from '../../src/git/hooks.js';
import { getRepo } from '../../src/db/repos.js';

describe('hookCommand', () => {
  let repoPath: string;
  let hooksDir: string;
  let output: string[] = [];
  let errOutput: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalCwd = process.cwd;

  beforeEach(() => {
    setupTestDb();
    output = [];
    errOutput = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    console.error = (...args: any[]) => errOutput.push(args.join(' '));
    mockExit.mockClear();

    // Create a fake git repo
    repoPath = mkdtempSync(join(tmpdir(), 'worktale-hook-cmd-'));
    hooksDir = join(repoPath, '.git', 'hooks');
    mkdirSync(join(repoPath, '.git'), { recursive: true });
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.cwd = originalCwd;
    teardownTestDb();
    try {
      rmSync(repoPath, { recursive: true, force: true });
    } catch {
      // Cleanup may fail on Windows
    }
  });

  // ---------- hook install ----------

  describe('install', () => {
    it('installs post-commit and post-push hooks', async () => {
      process.cwd = () => repoPath;

      await hookCommand('install');

      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(true);
      expect(existsSync(join(hooksDir, 'post-push'))).toBe(true);

      const postCommit = readFileSync(join(hooksDir, 'post-commit'), 'utf-8');
      expect(postCommit).toContain('worktale');
    });

    it('shows success message after install', async () => {
      process.cwd = () => repoPath;

      await hookCommand('install');

      const joined = output.join('\n');
      expect(joined).toContain('Hooks installed');
      expect(joined).toContain('post-commit');
      expect(joined).toContain('post-push');
    });

    it('installs hooks to a specified path', async () => {
      await hookCommand('install', repoPath);

      expect(existsSync(join(hooksDir, 'post-commit'))).toBe(true);
      expect(isHookInstalled(repoPath, 'post-commit')).toBe(true);
    });

    it('reports when hooks are already installed', async () => {
      process.cwd = () => repoPath;

      // Install once
      await hookCommand('install');
      output = [];
      mockExit.mockClear();

      // Install again
      await hookCommand('install');

      const joined = output.join('\n');
      expect(joined).toContain('already installed');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('auto-registers an untracked repo in the database', async () => {
      process.cwd = () => repoPath;

      // Repo is not in the DB yet
      expect(getRepo(repoPath)).toBeUndefined();

      await hookCommand('install');

      // Should now be registered
      const repo = getRepo(repoPath);
      expect(repo).toBeDefined();
      expect(repo!.path).toBe(repoPath);

      const joined = output.join('\n');
      expect(joined).toContain('Repo not tracked');
      expect(joined).toContain('Registering');
    });

    it('does not show registration message for already-tracked repos', async () => {
      process.cwd = () => repoPath;

      // Pre-register the repo
      const { addRepo } = await import('../../src/db/repos.js');
      addRepo(repoPath, 'pre-registered');

      await hookCommand('install');

      const joined = output.join('\n');
      expect(joined).not.toContain('Repo not tracked');
      expect(joined).toContain('Hooks installed');
    });

    it('fails when path is not a git repo', async () => {
      const nonGitPath = mkdtempSync(join(tmpdir(), 'worktale-no-git-'));

      await hookCommand('install', nonGitPath);

      const joined = output.join('\n');
      expect(joined).toContain('Not a git repository');
      expect(mockExit).toHaveBeenCalledWith(1);

      rmSync(nonGitPath, { recursive: true, force: true });
    });

    it('fails when cwd is not a git repo and no path given', async () => {
      const nonGitPath = mkdtempSync(join(tmpdir(), 'worktale-no-git-'));
      process.cwd = () => nonGitPath;

      await hookCommand('install');

      const joined = output.join('\n');
      expect(joined).toContain('Not a git repository');
      expect(mockExit).toHaveBeenCalledWith(1);

      rmSync(nonGitPath, { recursive: true, force: true });
    });
  });

  // ---------- hook uninstall ----------

  describe('uninstall', () => {
    it('removes worktale hooks', async () => {
      process.cwd = () => repoPath;

      // Install first
      await hookCommand('install');
      expect(isHookInstalled(repoPath, 'post-commit')).toBe(true);

      output = [];
      mockExit.mockClear();

      // Uninstall
      await hookCommand('uninstall');

      expect(isHookInstalled(repoPath, 'post-commit')).toBe(false);
      expect(isHookInstalled(repoPath, 'post-push')).toBe(false);
    });

    it('shows success message after uninstall', async () => {
      process.cwd = () => repoPath;

      await hookCommand('install');
      output = [];

      await hookCommand('uninstall');

      const joined = output.join('\n');
      expect(joined).toContain('Hooks removed');
    });

    it('reports when no hooks are found', async () => {
      process.cwd = () => repoPath;

      await hookCommand('uninstall');

      const joined = output.join('\n');
      expect(joined).toContain('No Worktale hooks found');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('uninstalls hooks from a specified path', async () => {
      // Install to path
      await hookCommand('install', repoPath);
      expect(isHookInstalled(repoPath, 'post-commit')).toBe(true);

      output = [];
      mockExit.mockClear();

      // Uninstall from path
      await hookCommand('uninstall', repoPath);

      expect(isHookInstalled(repoPath, 'post-commit')).toBe(false);
      const joined = output.join('\n');
      expect(joined).toContain('Hooks removed');
    });
  });

  // ---------- hook status ----------

  describe('status', () => {
    it('shows not installed when no hooks exist', async () => {
      process.cwd = () => repoPath;

      await hookCommand('status');

      const joined = output.join('\n');
      expect(joined).toContain('post-commit:');
      expect(joined).toContain('not installed');
    });

    it('shows installed after hooks are added', async () => {
      process.cwd = () => repoPath;

      await hookCommand('install');
      output = [];

      await hookCommand('status');

      const joined = output.join('\n');
      expect(joined).toContain('post-commit:');
      expect(joined).toContain('installed');
      expect(joined).toContain('post-push:');
    });

    it('shows status for a specified path', async () => {
      await hookCommand('install', repoPath);
      output = [];

      await hookCommand('status', repoPath);

      const joined = output.join('\n');
      expect(joined).toContain('installed');
    });
  });

  // ---------- hook (no action / help) ----------

  describe('help', () => {
    it('shows usage when no action is provided', async () => {
      process.cwd = () => repoPath;

      await hookCommand();

      const joined = output.join('\n');
      expect(joined).toContain('install');
      expect(joined).toContain('uninstall');
      expect(joined).toContain('status');
      expect(joined).toContain('Manage git hooks');
    });

    it('shows usage for unknown action', async () => {
      process.cwd = () => repoPath;

      await hookCommand('foobar');

      const joined = output.join('\n');
      expect(joined).toContain('install');
      expect(joined).toContain('uninstall');
      expect(joined).toContain('status');
    });
  });
});
