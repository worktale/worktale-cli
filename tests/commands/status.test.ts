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
import { statusCommand } from '../../src/commands/status.js';
import { addRepo } from '../../src/db/repos.js';
import { upsertDailySummary } from '../../src/db/daily-summaries.js';
import { getDateString } from '../../src/utils/formatting.js';

describe('statusCommand', () => {
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

    await statusCommand();

    const joined = output.join('\n');
    expect(joined).toContain('not initialized');
    expect(joined).toContain('worktale init');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "not initialized" when repo is not in the database', async () => {
    mockExistsSync.mockReturnValue(true);

    await statusCommand();

    const joined = output.join('\n');
    expect(joined).toContain('not initialized');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "0 commits today" when repo exists but no daily summary', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    await statusCommand();

    const joined = output.join('\n');
    expect(joined).toContain('0 commits today');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows correct stats when repo has commits today', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 5,
      lines_added: 120,
      lines_removed: 30,
      files_touched: 8,
    });

    mockExistsSync.mockReturnValue(true);

    await statusCommand();

    const joined = output.join('\n');
    expect(joined).toContain('5 commits');
    expect(joined).toContain('today');
    expect(joined).toContain('+120');
    expect(joined).toContain('-30');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows singular "1 commit" for a single commit', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 10,
      lines_removed: 2,
      files_touched: 1,
    });

    mockExistsSync.mockReturnValue(true);

    await statusCommand();

    const joined = output.join('\n');
    expect(joined).toContain('1 commit');
    expect(joined).not.toContain('1 commits');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows streak information when streak > 0', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    const today = getDateString();

    // Insert a commit for today so streak calculates to at least 1
    const db = getTestDb();
    db.prepare(
      `INSERT INTO commits (repo_id, sha, message, author, timestamp, lines_added, lines_removed, files_changed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(repoId, 'abc123def456abc123def456abc123def456abcd', 'test commit', 'tester', `${today}T12:00:00`, 10, 2, 1);

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 10,
      lines_removed: 2,
      files_touched: 1,
    });

    mockExistsSync.mockReturnValue(true);

    await statusCommand();

    const joined = output.join('\n');
    expect(joined).toContain('streak');
    expect(joined).toContain('1');
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
