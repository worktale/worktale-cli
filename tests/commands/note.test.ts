import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

// Mock DB
vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Import after mocks
import { noteCommand } from '../../src/commands/note.js';
import { addRepo, getRepo } from '../../src/db/repos.js';
import { getDailySummary, upsertDailySummary } from '../../src/db/daily-summaries.js';
import { getDateString } from '../../src/utils/formatting.js';

describe('noteCommand', () => {
  let repoPath: string;
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
    repoPath = mkdtempSync(join(tmpdir(), 'worktale-note-'));
    mkdirSync(join(repoPath, '.git'), { recursive: true });
    process.cwd = () => repoPath;
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

  // ---------- Usage / help ----------

  describe('usage', () => {
    it('shows usage when no message is provided', async () => {
      await noteCommand();

      const joined = output.join('\n');
      expect(joined).toContain('Usage:');
      expect(joined).toContain('worktale note');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('shows usage when message is empty string', async () => {
      await noteCommand('');

      const joined = output.join('\n');
      expect(joined).toContain('Usage:');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('shows usage when message is only whitespace', async () => {
      await noteCommand('   ');

      const joined = output.join('\n');
      expect(joined).toContain('Usage:');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ---------- Note saving ----------

  describe('saving notes', () => {
    it('appends a note to today\'s daily summary', async () => {
      // Register the repo first
      const repoId = addRepo(repoPath, 'test-repo');
      const today = getDateString();

      // Create an existing summary row
      upsertDailySummary({ repo_id: repoId, date: today, commits_count: 1 });

      await noteCommand('Built the auth middleware');

      const summary = getDailySummary(repoId, today);
      expect(summary).toBeDefined();
      expect(summary!.user_notes).toBe('Built the auth middleware');
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('appends to existing notes without overwriting', async () => {
      const repoId = addRepo(repoPath, 'test-repo');
      const today = getDateString();

      upsertDailySummary({ repo_id: repoId, date: today, commits_count: 2, user_notes: 'First note' });

      await noteCommand('Second note');

      const summary = getDailySummary(repoId, today);
      expect(summary!.user_notes).toBe('First note\nSecond note');
    });

    it('creates a daily summary row if none exists', async () => {
      const repoId = addRepo(repoPath, 'test-repo');
      const today = getDateString();

      // No existing summary
      expect(getDailySummary(repoId, today)).toBeUndefined();

      await noteCommand('Brand new note');

      const summary = getDailySummary(repoId, today);
      expect(summary).toBeDefined();
      expect(summary!.user_notes).toBe('Brand new note');
    });

    it('trims whitespace from the note', async () => {
      const repoId = addRepo(repoPath, 'test-repo');
      const today = getDateString();
      upsertDailySummary({ repo_id: repoId, date: today });

      await noteCommand('  padded note  ');

      const summary = getDailySummary(repoId, today);
      expect(summary!.user_notes).toBe('padded note');
    });

    it('shows confirmation after saving', async () => {
      addRepo(repoPath, 'test-repo');
      const today = getDateString();

      await noteCommand('My note');

      const joined = output.join('\n');
      expect(joined).toContain('Note added');
      expect(joined).toContain(today);
    });
  });

  // ---------- Auto-registration ----------

  describe('auto-registration', () => {
    it('auto-registers an untracked git repo', async () => {
      // Repo has .git but is NOT in the database
      expect(getRepo(repoPath)).toBeUndefined();

      await noteCommand('Auto-reg note');

      // Should now be registered
      const repo = getRepo(repoPath);
      expect(repo).toBeDefined();

      // Note should be saved
      const today = getDateString();
      const summary = getDailySummary(repo!.id, today);
      expect(summary).toBeDefined();
      expect(summary!.user_notes).toBe('Auto-reg note');
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  // ---------- Error handling ----------

  describe('error handling', () => {
    it('shows error when not in a git repo and not tracked', async () => {
      const nonGitPath = mkdtempSync(join(tmpdir(), 'worktale-no-git-'));
      process.cwd = () => nonGitPath;

      await noteCommand('This should fail');

      const joined = output.join('\n');
      expect(joined).toContain('not a tracked repo');
      expect(mockExit).toHaveBeenCalledWith(1);

      rmSync(nonGitPath, { recursive: true, force: true });
    });
  });

  // ---------- Multiple notes ----------

  describe('multiple sequential notes', () => {
    it('accumulates multiple notes in order', async () => {
      const repoId = addRepo(repoPath, 'test-repo');
      const today = getDateString();
      upsertDailySummary({ repo_id: repoId, date: today });

      await noteCommand('First: added auth');
      mockExit.mockClear();
      await noteCommand('Second: fixed tests');
      mockExit.mockClear();
      await noteCommand('Third: updated docs');

      const summary = getDailySummary(repoId, today);
      expect(summary!.user_notes).toBe(
        'First: added auth\nSecond: fixed tests\nThird: updated docs',
      );
    });
  });
});
