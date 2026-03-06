import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

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
import { logCommand } from '../../src/commands/log.js';
import { addRepo } from '../../src/db/repos.js';
import { insertCommit } from '../../src/db/commits.js';
import { upsertDailySummary } from '../../src/db/daily-summaries.js';
import { getDateString } from '../../src/utils/formatting.js';

/** Returns a date string N days before today */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getDateString(d);
}

describe('logCommand', () => {
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

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    expect(joined).toContain('not initialized');
    expect(joined).toContain('worktale init');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "repo not found" when repo is not in the database', async () => {
    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    expect(joined).toContain('repo not found');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "No activity" when there are no commits in the range', async () => {
    const cwd = process.cwd();
    addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    expect(joined).toContain('No activity');
    expect(joined).toContain('7 days');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('defaults to 7 days when days option is invalid', async () => {
    const cwd = process.cwd();
    addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: 'not-a-number' });

    const joined = output.join('\n');
    expect(joined).toContain('Last 7 days');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('displays header with correct day count', async () => {
    const cwd = process.cwd();
    addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '14' });

    const joined = output.join('\n');
    expect(joined).toContain('WORKTALE LOG');
    expect(joined).toContain('Last 14 days');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows daily summaries with commit details', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'feat: add auth module',
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 50,
      lines_removed: 5,
      files_changed: 3,
    });
    insertCommit({
      repo_id: repoId,
      sha: 'bbbb2222cccc3333dddd4444eeee5555ffff6666',
      message: 'fix: patch login bug',
      author: 'tester',
      timestamp: `${today}T14:00:00`,
      lines_added: 20,
      lines_removed: 10,
      files_changed: 2,
    });

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 2,
      lines_added: 70,
      lines_removed: 15,
      files_touched: 5,
    });

    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    expect(joined).toContain('2 commits');
    expect(joined).toContain('+70');
    expect(joined).toContain('-15');
    expect(joined).toContain('5 files');
    expect(joined).toContain('feat: add auth module');
    expect(joined).toContain('fix: patch login bug');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows singular "1 commit" for single commit days', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'solo commit',
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 10,
      lines_removed: 2,
      files_changed: 1,
    });

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 10,
      lines_removed: 2,
      files_touched: 1,
    });

    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    expect(joined).toContain('1 commit');
    expect(joined).not.toContain('1 commits');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('displays multiple days in reverse chronological order', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();
    const yesterday = daysAgo(1);

    // Today's commit
    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'today work',
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 30,
      lines_removed: 5,
      files_changed: 2,
    });
    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 30,
      lines_removed: 5,
      files_touched: 2,
    });

    // Yesterday's commit
    insertCommit({
      repo_id: repoId,
      sha: 'bbbb2222cccc3333dddd4444eeee5555ffff6666',
      message: 'yesterday work',
      author: 'tester',
      timestamp: `${yesterday}T15:00:00`,
      lines_added: 50,
      lines_removed: 10,
      files_changed: 4,
    });
    upsertDailySummary({
      repo_id: repoId,
      date: yesterday,
      commits_count: 1,
      lines_added: 50,
      lines_removed: 10,
      files_touched: 4,
    });

    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    // Today's data should appear before yesterday's (reverse chrono)
    const todayIdx = joined.indexOf('today work');
    const yesterdayIdx = joined.indexOf('yesterday work');
    expect(todayIdx).toBeGreaterThan(-1);
    expect(yesterdayIdx).toBeGreaterThan(-1);
    expect(todayIdx).toBeLessThan(yesterdayIdx);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('truncates long commit messages at 60 chars', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    const longMsg = 'b'.repeat(65);
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
    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 5,
      lines_removed: 1,
      files_touched: 1,
    });

    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    // Message sliced to 57 + '...'
    expect(joined).toContain('b'.repeat(57) + '...');
    expect(joined).not.toContain('b'.repeat(58));
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('limits commits per day to 8 and shows overflow count', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    // Insert 11 commits
    for (let i = 0; i < 11; i++) {
      const hex = i.toString(16).padStart(2, '0');
      insertCommit({
        repo_id: repoId,
        sha: `${hex}aa1111bbbb2222cccc3333dddd4444eeee5555`,
        message: `commit-${i + 1}`,
        author: 'tester',
        timestamp: `${today}T${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`,
        lines_added: 5,
        lines_removed: 1,
        files_changed: 1,
      });
    }
    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 11,
      lines_added: 55,
      lines_removed: 11,
      files_touched: 11,
    });

    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    expect(joined).toContain('...and 3 more');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('skips days with zero commits in summaries', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();
    const yesterday = daysAgo(1);

    // Today has commits
    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555',
      message: 'today commit',
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 10,
      lines_removed: 2,
      files_changed: 1,
    });
    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 10,
      lines_removed: 2,
      files_touched: 1,
    });

    // Yesterday has zero-commit summary (shouldn't display)
    upsertDailySummary({
      repo_id: repoId,
      date: yesterday,
      commits_count: 0,
      lines_added: 0,
      lines_removed: 0,
      files_touched: 0,
    });

    mockExistsSync.mockReturnValue(true);

    await logCommand({ days: '7' });

    const joined = output.join('\n');
    expect(joined).toContain('today commit');
    // Should not show a "0 commits" line
    expect(joined).not.toContain('0 commits');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('respects the --repo flag for custom repo path', async () => {
    // When --repo is provided, logCommand uses that path instead of cwd
    const customPath = '/tmp/test-custom-repo';
    mockExistsSync.mockReturnValue(false);

    await logCommand({ days: '7', repo: customPath });

    const joined = output.join('\n');
    expect(joined).toContain('not initialized');
    // existsSync should have been called with the custom path
    expect(mockExistsSync).toHaveBeenCalledWith(
      expect.stringContaining('test-custom-repo'),
    );
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
