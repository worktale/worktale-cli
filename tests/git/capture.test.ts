import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestRepo, addTestCommit } from '../helpers/test-repo.js';

/*
 * captureLatestCommit depends on the DB layer. We mock the DB modules
 * so these tests focus on the capture logic in isolation.
 */

// Mock the DB modules before importing capture
vi.mock('../../src/db/repos.js', () => ({
  getRepo: vi.fn(),
}));

vi.mock('../../src/db/commits.js', () => ({
  commitExists: vi.fn(),
  insertCommit: vi.fn(),
}));

vi.mock('../../src/db/daily-summaries.js', () => ({
  getDailySummary: vi.fn(),
  upsertDailySummary: vi.fn(),
}));

vi.mock('../../src/db/index.js', () => {
  const mockStmt = { run: vi.fn() };
  const mockDb = {
    prepare: vi.fn(() => mockStmt),
    transaction: vi.fn((fn: Function) => fn),
  };
  return { getDb: vi.fn(() => mockDb) };
});

// Import after mocks are set up
import { captureLatestCommit, captureCommitData } from '../../src/git/capture.js';
import { getRepo } from '../../src/db/repos.js';
import { commitExists, insertCommit } from '../../src/db/commits.js';
import { getDailySummary, upsertDailySummary } from '../../src/db/daily-summaries.js';
import type { GitCommitData } from '../../src/git/log.js';

const mockedGetRepo = vi.mocked(getRepo);
const mockedCommitExists = vi.mocked(commitExists);
const mockedInsertCommit = vi.mocked(insertCommit);
const mockedGetDailySummary = vi.mocked(getDailySummary);
const mockedUpsertDailySummary = vi.mocked(upsertDailySummary);

let repoPath: string;
let cleanup: () => void;

beforeEach(async () => {
  vi.clearAllMocks();
  const repo = await createTestRepo();
  repoPath = repo.path;
  cleanup = repo.cleanup;

  // Seed the repo with a commit so getLatestCommit returns something
  await addTestCommit(repoPath, 'file.txt', 'hello', 'test commit');
});

afterEach(() => {
  cleanup();
});

// ---------- captureLatestCommit ----------

describe('captureLatestCommit', () => {
  it('does nothing if repo is not in the DB', async () => {
    mockedGetRepo.mockReturnValue(undefined);

    await captureLatestCommit(repoPath);

    expect(mockedInsertCommit).not.toHaveBeenCalled();
  });

  it('captures a commit when repo exists and commit is new', async () => {
    mockedGetRepo.mockReturnValue({
      id: 1,
      path: repoPath,
      name: 'test',
      first_seen: null,
      last_synced: null,
    });
    mockedCommitExists.mockReturnValue(false);
    mockedGetDailySummary.mockReturnValue(undefined);

    await captureLatestCommit(repoPath);

    expect(mockedInsertCommit).toHaveBeenCalledTimes(1);
    expect(mockedUpsertDailySummary).toHaveBeenCalledTimes(1);

    // Verify the commit data passed to insertCommit
    const insertCall = mockedInsertCommit.mock.calls[0][0];
    expect(insertCall.repo_id).toBe(1);
    expect(insertCall.sha).toMatch(/^[0-9a-f]+$/i);
    expect(insertCall.message).toBe('test commit');
  });

  it('skips duplicate commits', async () => {
    mockedGetRepo.mockReturnValue({
      id: 1,
      path: repoPath,
      name: 'test',
      first_seen: null,
      last_synced: null,
    });
    mockedCommitExists.mockReturnValue(true); // Already captured

    await captureLatestCommit(repoPath);

    expect(mockedInsertCommit).not.toHaveBeenCalled();
  });

  it('does not print output when silent=true', async () => {
    mockedGetRepo.mockReturnValue({
      id: 1,
      path: repoPath,
      name: 'test',
      first_seen: null,
      last_synced: null,
    });
    mockedCommitExists.mockReturnValue(false);
    mockedGetDailySummary.mockReturnValue(undefined);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await captureLatestCommit(repoPath, true);

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('prints output when silent is not set', async () => {
    mockedGetRepo.mockReturnValue({
      id: 1,
      path: repoPath,
      name: 'test',
      first_seen: null,
      last_synced: null,
    });
    mockedCommitExists.mockReturnValue(false);
    mockedGetDailySummary.mockReturnValue(undefined);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await captureLatestCommit(repoPath, false);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain('worktale');
    expect(output).toContain('test commit');
    consoleSpy.mockRestore();
  });

  it('handles missing repo gracefully (no throw)', async () => {
    // Even if something unexpected happens, captureLatestCommit never throws
    mockedGetRepo.mockImplementation(() => {
      throw new Error('DB broken');
    });

    await expect(captureLatestCommit(repoPath)).resolves.not.toThrow();
  });
});

// ---------- captureCommitData ----------

describe('captureCommitData', () => {
  const makeCommitData = (overrides?: Partial<GitCommitData>): GitCommitData => ({
    sha: 'abc123def456abc123def456abc123def456abc1',
    message: 'feat: add new feature',
    author: 'Test User',
    authorEmail: 'test@example.com',
    timestamp: '2026-03-06T10:30:00+00:00',
    linesAdded: 50,
    linesRemoved: 10,
    filesChanged: 3,
    filePaths: ['src/api/routes.ts', 'tests/api.test.ts', 'package.json'],
    branch: 'main',
    isMerge: false,
    tags: ['v1.0.0'],
    ...overrides,
  });

  it('inserts commit data into DB', () => {
    mockedGetDailySummary.mockReturnValue(undefined);

    captureCommitData(1, makeCommitData());

    expect(mockedInsertCommit).toHaveBeenCalledTimes(1);
    const data = mockedInsertCommit.mock.calls[0][0];
    expect(data.repo_id).toBe(1);
    expect(data.sha).toBe('abc123def456abc123def456abc123def456abc1');
    expect(data.lines_added).toBe(50);
    expect(data.lines_removed).toBe(10);
    expect(data.is_merge).toBe(0);
    expect(data.tags).toBe('v1.0.0');
  });

  it('upserts daily summary with accumulated values', () => {
    // Simulate an existing summary for the day
    mockedGetDailySummary.mockReturnValue({
      id: 1,
      repo_id: 1,
      date: '2026-03-06',
      commits_count: 2,
      lines_added: 100,
      lines_removed: 20,
      files_touched: 5,
      user_notes: null,
      ai_draft: null,
      published: 0,
      published_at: null,
    });

    captureCommitData(1, makeCommitData());

    expect(mockedUpsertDailySummary).toHaveBeenCalledWith({
      repo_id: 1,
      date: '2026-03-06',
      commits_count: 3, // 2 + 1
      lines_added: 150, // 100 + 50
      lines_removed: 30, // 20 + 10
      files_touched: 8, // 5 + 3
    });
  });

  it('creates fresh daily summary if none exists', () => {
    mockedGetDailySummary.mockReturnValue(undefined);

    captureCommitData(1, makeCommitData());

    expect(mockedUpsertDailySummary).toHaveBeenCalledWith({
      repo_id: 1,
      date: '2026-03-06',
      commits_count: 1,
      lines_added: 50,
      lines_removed: 10,
      files_touched: 3,
    });
  });

  it('handles merge commits (is_merge flag)', () => {
    mockedGetDailySummary.mockReturnValue(undefined);

    captureCommitData(1, makeCommitData({ isMerge: true }));

    const data = mockedInsertCommit.mock.calls[0][0];
    expect(data.is_merge).toBe(1);
  });

  it('handles commits with no tags', () => {
    mockedGetDailySummary.mockReturnValue(undefined);

    captureCommitData(1, makeCommitData({ tags: [] }));

    const data = mockedInsertCommit.mock.calls[0][0];
    expect(data.tags).toBeNull();
  });

  it('handles commits with multiple tags', () => {
    mockedGetDailySummary.mockReturnValue(undefined);

    captureCommitData(1, makeCommitData({ tags: ['v1.0.0', 'release'] }));

    const data = mockedInsertCommit.mock.calls[0][0];
    expect(data.tags).toBe('v1.0.0,release');
  });

  it('swallows errors silently', () => {
    mockedInsertCommit.mockImplementation(() => {
      throw new Error('DB write failed');
    });

    // Should not throw
    expect(() => captureCommitData(1, makeCommitData())).not.toThrow();
  });
});
