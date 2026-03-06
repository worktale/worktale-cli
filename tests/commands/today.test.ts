import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb } from '../helpers/test-db.js';
import { getTestDb } from '../helpers/test-db.js';

// Mock DB
vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock process.exit so it doesn't kill the test runner
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Mock existsSync for .worktale/config.json detection
const mockExistsSync = vi.fn<(path: string) => boolean>();
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => mockExistsSync(args[0] as string),
  };
});

// Import after mocks
import { todayCommand } from '../../src/commands/today.js';
import { addRepo } from '../../src/db/repos.js';
import { insertCommit } from '../../src/db/commits.js';
import { upsertDailySummary } from '../../src/db/daily-summaries.js';
import { getDateString } from '../../src/utils/formatting.js';

describe('todayCommand', () => {
  let output: string[] = [];
  const originalLog = console.log;

  beforeEach(() => {
    setupTestDb();
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    mockExit.mockClear();
    mockExistsSync.mockReset();
  });

  afterEach(() => {
    console.log = originalLog;
    teardownTestDb();
  });

  it('shows "not initialized" when .worktale/config.json does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await todayCommand();

    const joined = output.join('\n');
    expect(joined).toContain('not initialized');
    expect(joined).toContain('worktale init');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "repo not found" when repo is not in the database', async () => {
    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    expect(joined).toContain('repo not found');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "No commits yet today" when repo has no commits today', async () => {
    const cwd = process.cwd();
    addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    expect(joined).toContain('No commits yet today');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows correct stats when repo has commits today', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    // Insert commits
    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'feat: add user login',
      author: 'tester',
      timestamp: `${today}T09:00:00`,
      lines_added: 80,
      lines_removed: 10,
      files_changed: 3,
    });
    insertCommit({
      repo_id: repoId,
      sha: 'bbbb2222cccc3333dddd4444eeee5555ffff6666',
      message: 'fix: resolve auth bug',
      author: 'tester',
      timestamp: `${today}T11:30:00`,
      lines_added: 40,
      lines_removed: 20,
      files_changed: 5,
    });

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 2,
      lines_added: 120,
      lines_removed: 30,
      files_touched: 8,
    });

    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    expect(joined).toContain('2');
    expect(joined).toContain('+120');
    expect(joined).toContain('-30');
    expect(joined).toContain('8');
    expect(joined).toContain('Recent:');
    expect(joined).toContain('feat: add user login');
    expect(joined).toContain('fix: resolve auth bug');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('calculates coding time from commit timestamps', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    // Two commits 2 hours apart
    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'morning commit',
      author: 'tester',
      timestamp: `${today}T09:00:00`,
      lines_added: 10,
      lines_removed: 2,
      files_changed: 1,
    });
    insertCommit({
      repo_id: repoId,
      sha: 'bbbb2222cccc3333dddd4444eeee5555ffff6666',
      message: 'later commit',
      author: 'tester',
      timestamp: `${today}T11:00:00`,
      lines_added: 20,
      lines_removed: 5,
      files_changed: 2,
    });

    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    // 2 hours = "2h 0m" via formatDuration
    expect(joined).toContain('2h');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "< 1m" coding time for a single commit', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'solo commit',
      author: 'tester',
      timestamp: `${today}T14:00:00`,
      lines_added: 5,
      lines_removed: 1,
      files_changed: 1,
    });

    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    expect(joined).toContain('< 1m');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('truncates long commit messages at 55 chars', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    const longMsg = 'a'.repeat(60);
    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: longMsg,
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 5,
      lines_removed: 1,
      files_changed: 1,
    });

    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    // Message is sliced to 52 + '...'
    expect(joined).toContain('a'.repeat(52) + '...');
    expect(joined).not.toContain('a'.repeat(53));
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "(no message)" for commits without a message', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: null,
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 5,
      lines_removed: 1,
      files_changed: 1,
    });

    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    expect(joined).toContain('(no message)');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('limits recent commits display to 10 and shows overflow count', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    // Insert 13 commits
    for (let i = 0; i < 13; i++) {
      const hex = i.toString(16).padStart(2, '0');
      insertCommit({
        repo_id: repoId,
        sha: `${hex}aa1111bbbb2222cccc3333dddd4444eeee5555`,
        message: `commit number ${i + 1}`,
        author: 'tester',
        timestamp: `${today}T${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`,
        lines_added: 5,
        lines_removed: 1,
        files_changed: 1,
      });
    }

    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    expect(joined).toContain('...and 3 more');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('uses summary stats when daily summary exists', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    // Commit has different line counts than summary
    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'test commit',
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 10,
      lines_removed: 2,
      files_changed: 1,
    });

    // Summary has different (aggregated) counts
    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 999,
      lines_removed: 111,
      files_touched: 42,
    });

    mockExistsSync.mockReturnValue(true);

    await todayCommand();

    const joined = output.join('\n');
    // Should use summary values, not commit values
    expect(joined).toContain('+999');
    expect(joined).toContain('-111');
    expect(joined).toContain('42');
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
