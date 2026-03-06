import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

// Mock DB
vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock existsSync for .worktale/config.json detection
const mockExistsSync = vi.fn<(path: string) => boolean>();
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (...args: Parameters<typeof actual.existsSync>) => mockExistsSync(args[0] as string),
  };
});

// Mock readline to auto-accept prompts
vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (_q: string, cb: (answer: string) => void) => cb('y'),
    close: () => {},
  }),
}));

// Mock config
const mockLoadConfig = vi.fn();
vi.mock('../../src/config/index.js', () => ({
  loadConfig: () => mockLoadConfig(),
  getConfigPath: () => '/mock/.worktale/config.json',
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Mock fetch for Ollama tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks
import { digestCommand } from '../../src/commands/digest.js';
import { addRepo } from '../../src/db/repos.js';
import { insertCommit } from '../../src/db/commits.js';
import { upsertDailySummary } from '../../src/db/daily-summaries.js';
import { getDateString } from '../../src/utils/formatting.js';

describe('digestCommand', () => {
  let output: string[] = [];
  const originalLog = console.log;
  const today = getDateString();

  beforeEach(() => {
    setupTestDb();
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    mockExit.mockClear();
    mockExistsSync.mockReset();
    mockLoadConfig.mockReset();
    mockFetch.mockReset();

    // Default config: template mode (no AI)
    mockLoadConfig.mockReturnValue({
      cloudEnabled: false,
      nudgeTime: '17:00',
      timezone: 'auto',
      colorScheme: 'default',
      ai: { provider: 'template', model: null, ollamaUrl: 'http://localhost:11434' },
      git: { userEmail: 'test@example.com', userEmailOverride: null },
      showCaptureConfirmation: false,
    });
  });

  afterEach(() => {
    console.log = originalLog;
    teardownTestDb();
  });

  it('shows "not initialized" when no config exists', async () => {
    mockExistsSync.mockReturnValue(false);

    await digestCommand();

    const joined = output.join('\n');
    expect(joined).toContain('not initialized');
    expect(joined).toContain('worktale init');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "no commits today" when there are no commits', async () => {
    const cwd = process.cwd();
    addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    await digestCommand();

    const joined = output.join('\n');
    expect(joined).toContain('No commits today');
    expect(joined).toContain('Nothing to digest');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('generates template digest with correct content', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    // Insert commits for today
    insertCommit({
      repo_id: repoId,
      sha: 'aaa111bbb222ccc333ddd444eee555fff666aaa1',
      message: 'feat: add user authentication',
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 100,
      lines_removed: 10,
      files_changed: 5,
    });
    insertCommit({
      repo_id: repoId,
      sha: 'bbb222ccc333ddd444eee555fff666aaa111bbb2',
      message: 'fix: resolve login bug',
      author: 'tester',
      timestamp: `${today}T14:00:00`,
      lines_added: 20,
      lines_removed: 5,
      files_changed: 2,
    });

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 2,
      lines_added: 120,
      lines_removed: 15,
      files_touched: 7,
    });

    await digestCommand();

    const joined = output.join('\n');
    // Template digest should contain "What I built" section
    expect(joined).toContain('What I built');
    // Should transform conventional commit prefixes
    expect(joined).toContain('Added');
    expect(joined).toContain('Fixed');
    // Should contain stats
    expect(joined).toContain('Stats');
    expect(joined).toContain('2 commits');
    // Should show the digest heading
    expect(joined).toContain('WORKTALE DIGEST');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('falls back from Ollama to template when Ollama is unreachable', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    // Configure Ollama mode
    mockLoadConfig.mockReturnValue({
      cloudEnabled: false,
      nudgeTime: '17:00',
      timezone: 'auto',
      colorScheme: 'default',
      ai: { provider: 'ollama', model: 'llama3', ollamaUrl: 'http://localhost:11434' },
      git: { userEmail: 'test@example.com', userEmailOverride: null },
      showCaptureConfirmation: false,
    });

    // Insert a commit for today
    insertCommit({
      repo_id: repoId,
      sha: 'ccc333ddd444eee555fff666aaa111bbb222ccc3',
      message: 'chore: update dependencies',
      author: 'tester',
      timestamp: `${today}T09:00:00`,
      lines_added: 50,
      lines_removed: 20,
      files_changed: 3,
    });

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 1,
      lines_added: 50,
      lines_removed: 20,
      files_touched: 3,
    });

    // Make fetch reject (Ollama unavailable)
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await digestCommand();

    const joined = output.join('\n');
    // Should show fallback notice
    expect(joined).toContain('Ollama not available');
    expect(joined).toContain('Falling back to template');
    // Should still produce a template digest
    expect(joined).toContain('What I built');
    expect(joined).toContain('Stats');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('handles empty commit messages gracefully', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    // Insert a commit with no message
    insertCommit({
      repo_id: repoId,
      sha: 'ddd444eee555fff666aaa111bbb222ccc333ddd4',
      message: null,
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

    await digestCommand();

    const joined = output.join('\n');
    // Should not crash - should still show digest content
    expect(joined).toContain('WORKTALE DIGEST');
    expect(joined).toContain('Stats');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('de-duplicates identical commit messages', async () => {
    const cwd = process.cwd();
    const repoId = addRepo(cwd, 'test-repo');
    mockExistsSync.mockReturnValue(true);

    // Insert two commits with the same message
    insertCommit({
      repo_id: repoId,
      sha: 'eee555fff666aaa111bbb222ccc333ddd444eee5',
      message: 'fix: resolve bug',
      author: 'tester',
      timestamp: `${today}T10:00:00`,
      lines_added: 5,
      lines_removed: 1,
      files_changed: 1,
    });
    insertCommit({
      repo_id: repoId,
      sha: 'fff666aaa111bbb222ccc333ddd444eee555fff6',
      message: 'fix: resolve bug',
      author: 'tester',
      timestamp: `${today}T11:00:00`,
      lines_added: 3,
      lines_removed: 1,
      files_changed: 1,
    });

    upsertDailySummary({
      repo_id: repoId,
      date: today,
      commits_count: 2,
      lines_added: 8,
      lines_removed: 2,
      files_touched: 2,
    });

    await digestCommand();

    const joined = output.join('\n');
    // The template deduplicates messages, so "Fixed resolve bug" should appear only once
    const matches = joined.match(/Fixed resolve bug/g);
    expect(matches).toHaveLength(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
