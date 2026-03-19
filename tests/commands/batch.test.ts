import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

// Mock the worker-based analysis to avoid spawning a real Worker thread
const mockRunAnalysis = vi.fn();
vi.mock('../../src/workers/run-analysis.js', () => ({
  runAnalysis: (...args: any[]) => mockRunAnalysis(...args),
}));

// Mock config
const mockLoadConfig = vi.fn();
const mockSaveConfig = vi.fn();
vi.mock('../../src/config/index.js', () => ({
  loadConfig: () => mockLoadConfig(),
  saveConfig: (...args: any[]) => mockSaveConfig(...args),
}));

// Mock readline for interactive annotation prompts
const mockQuestion = vi.fn();
vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (q: string, cb: (answer: string) => void) => mockQuestion(q, cb),
    close: () => {},
  }),
}));

// Mock fetch for Ollama tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks
import { batchCommand } from '../../src/commands/batch.js';
import { getAllRepos } from '../../src/db/repos.js';
import { insertCommit } from '../../src/db/commits.js';
import { upsertDailySummary, getDailySummary, getAllDailySummaries } from '../../src/db/daily-summaries.js';

describe('batchCommand', () => {
  let tempDir: string;
  let output: string[] = [];
  const originalLog = console.log;
  const originalCwd = process.cwd;
  const originalStdoutWrite = process.stdout.write;

  beforeEach(() => {
    setupTestDb();
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    // Suppress progress bar writes
    process.stdout.write = (() => true) as any;
    mockExit.mockClear();
    mockRunAnalysis.mockReset();
    mockLoadConfig.mockReset();
    mockSaveConfig.mockReset();
    mockQuestion.mockReset();
    mockFetch.mockReset();

    // Default config
    mockLoadConfig.mockReturnValue({
      cloudEnabled: false,
      nudgeTime: '17:00',
      timezone: 'auto',
      colorScheme: 'default',
      ai: { provider: 'template', model: null, ollamaUrl: 'http://localhost:11434' },
      git: { userEmail: 'test@example.com', userEmailOverride: null },
      showCaptureConfirmation: false,
    });

    // Default readline: auto-accept
    mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('y'));

    // Create temp directory structure
    tempDir = mkdtempSync(join(tmpdir(), 'worktale-batch-'));

    // Mock runAnalysis to return reasonable stats
    mockRunAnalysis.mockResolvedValue({
      totalCommits: 10,
      firstCommitDate: '2025-01-01T10:00:00Z',
      linesAdded: 200,
      linesRemoved: 50,
      filesTracked: 15,
      branchCount: 2,
      authorCount: 1,
      daysActive: 5,
    });
  });

  afterEach(() => {
    console.log = originalLog;
    process.cwd = originalCwd;
    process.stdout.write = originalStdoutWrite;
    teardownTestDb();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup may fail on Windows
    }
  });

  function createFakeGitRepo(parentDir: string, name: string): string {
    const repoPath = join(parentDir, name);
    mkdirSync(join(repoPath, '.git'), { recursive: true });
    return repoPath;
  }

  it('finds and processes git repos in the current directory', async () => {
    createFakeGitRepo(tempDir, 'repo-alpha');
    createFakeGitRepo(tempDir, 'repo-beta');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('repo-alpha');
    expect(joined).toContain('repo-beta');
    expect(joined).toContain('Found 2 repos');
    expect(mockRunAnalysis).toHaveBeenCalledTimes(2);
  });

  it('registers repos in the database', async () => {
    createFakeGitRepo(tempDir, 'my-project');
    process.cwd = () => tempDir;

    await batchCommand();

    const repos = getAllRepos();
    expect(repos.length).toBe(1);
    expect(repos[0].name).toBe('my-project');
  });

  it('shows summary stats after processing', async () => {
    createFakeGitRepo(tempDir, 'project-one');
    createFakeGitRepo(tempDir, 'project-two');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('Batch Summary');
    expect(joined).toContain('Repos:');
    expect(joined).toContain('Commits:');
    expect(joined).toContain('Lines added:');
    expect(joined).toContain('Lines removed:');
    expect(joined).toContain('Batch scan complete');
  });

  it('reports no hooks were installed', async () => {
    createFakeGitRepo(tempDir, 'some-repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('No hooks were installed');
  });

  it('handles empty directory with no repos', async () => {
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('No git repositories found');
    expect(mockRunAnalysis).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('finds nested repos up to max depth', async () => {
    // Create a repo nested 2 levels deep
    const nested = join(tempDir, 'projects', 'work');
    mkdirSync(nested, { recursive: true });
    createFakeGitRepo(nested, 'deep-repo');
    process.cwd = () => tempDir;

    await batchCommand({ depth: '5' });

    const joined = output.join('\n');
    expect(joined).toContain('deep-repo');
    expect(mockRunAnalysis).toHaveBeenCalledTimes(1);
  });

  it('respects depth limit', async () => {
    // Create a repo nested deeper than max depth
    const deep = join(tempDir, 'a', 'b', 'c', 'd', 'e', 'f');
    mkdirSync(deep, { recursive: true });
    createFakeGitRepo(deep, 'too-deep');
    process.cwd = () => tempDir;

    await batchCommand({ depth: '2' });

    const joined = output.join('\n');
    expect(joined).toContain('No git repositories found');
    expect(mockRunAnalysis).not.toHaveBeenCalled();
  });

  it('skips node_modules directories', async () => {
    const nodeModules = join(tempDir, 'node_modules');
    mkdirSync(nodeModules, { recursive: true });
    createFakeGitRepo(nodeModules, 'some-package');

    // Also create a normal repo so we can verify scanning works
    createFakeGitRepo(tempDir, 'real-repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('real-repo');
    expect(joined).not.toContain('some-package');
    expect(joined).toContain('Found 1 repo');
  });

  it('skips bin and obj directories (.NET build output)', async () => {
    const binDir = join(tempDir, 'bin');
    const objDir = join(tempDir, 'obj');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(objDir, { recursive: true });
    createFakeGitRepo(binDir, 'bin-repo');
    createFakeGitRepo(objDir, 'obj-repo');

    createFakeGitRepo(tempDir, 'real-repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('real-repo');
    expect(joined).not.toContain('bin-repo');
    expect(joined).not.toContain('obj-repo');
    expect(joined).toContain('Found 1 repo');
  });

  it('skips build output directories (dist, build, target)', async () => {
    for (const dir of ['dist', 'build', 'target']) {
      const d = join(tempDir, dir);
      mkdirSync(d, { recursive: true });
      createFakeGitRepo(d, `${dir}-repo`);
    }

    createFakeGitRepo(tempDir, 'source-repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('source-repo');
    expect(joined).toContain('Found 1 repo');
  });

  it('skips hidden directories', async () => {
    const hidden = join(tempDir, '.hidden');
    mkdirSync(hidden, { recursive: true });
    createFakeGitRepo(hidden, 'hidden-repo');

    createFakeGitRepo(tempDir, 'visible-repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('visible-repo');
    expect(joined).not.toContain('hidden-repo');
  });

  it('does not recurse into git repos (treats them as leaf nodes)', async () => {
    // Create a repo, then a sub-repo inside it (like a submodule)
    const parentRepo = createFakeGitRepo(tempDir, 'parent');
    // Create a nested dir inside the parent that also has .git
    const childDir = join(parentRepo, 'vendor', 'child');
    mkdirSync(join(childDir, '.git'), { recursive: true });

    process.cwd = () => tempDir;

    await batchCommand();

    // Should only find the parent, not recurse into it
    const joined = output.join('\n');
    expect(joined).toContain('Found 1 repo');
    expect(joined).toContain('parent');
  });

  it('handles analysis errors for individual repos gracefully', async () => {
    createFakeGitRepo(tempDir, 'good-repo');
    createFakeGitRepo(tempDir, 'bad-repo');
    process.cwd = () => tempDir;

    // Make the second call fail
    let callCount = 0;
    mockRunAnalysis.mockImplementation(() => {
      callCount++;
      if (callCount === 2) {
        throw new Error('git log failed');
      }
      return Promise.resolve({
        totalCommits: 5,
        firstCommitDate: '2025-01-01T10:00:00Z',
        linesAdded: 100,
        linesRemoved: 20,
        filesTracked: 10,
        branchCount: 1,
        authorCount: 1,
        daysActive: 3,
      });
    });

    await batchCommand();

    const joined = output.join('\n');
    // Should report 1 error but still complete
    expect(joined).toContain('Errors:');
    expect(joined).toContain('git log failed');
    expect(joined).toContain('Batch scan complete');
  });

  it('accumulates totals across repos', async () => {
    createFakeGitRepo(tempDir, 'repo-a');
    createFakeGitRepo(tempDir, 'repo-b');
    process.cwd = () => tempDir;

    // Each repo returns 10 commits, so total should be 20
    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('20'); // 10 + 10 total commits
  });

  it('shows all-time warning when --since is not provided', async () => {
    createFakeGitRepo(tempDir, 'some-repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('all time');
    expect(joined).toContain('--since');
  });

  it('passes --since to runAnalysis when provided', async () => {
    createFakeGitRepo(tempDir, 'some-repo');
    process.cwd = () => tempDir;

    await batchCommand({ since: '3m' });

    expect(mockRunAnalysis).toHaveBeenCalledTimes(1);
    const callArgs = mockRunAnalysis.mock.calls[0];
    // 5th argument is the since parameter
    expect(callArgs[4]).toBe('3 months ago');
  });

  it('parses --since shorthand values correctly', async () => {
    createFakeGitRepo(tempDir, 'repo');
    process.cwd = () => tempDir;

    await batchCommand({ since: '30d' });
    expect(mockRunAnalysis.mock.calls[0][4]).toBe('30 days ago');

    mockRunAnalysis.mockClear();
    await batchCommand({ since: '6w' });
    expect(mockRunAnalysis.mock.calls[0][4]).toBe('42 days ago');

    mockRunAnalysis.mockClear();
    await batchCommand({ since: '1y' });
    expect(mockRunAnalysis.mock.calls[0][4]).toBe('1 years ago');
  });

  it('displays since value in header when provided', async () => {
    createFakeGitRepo(tempDir, 'some-repo');
    process.cwd = () => tempDir;

    await batchCommand({ since: '6m' });

    const joined = output.join('\n');
    expect(joined).toContain('Since:');
    expect(joined).toContain('6 months ago');
    expect(joined).not.toContain('all time');
  });

  it('does not pass since to runAnalysis when not provided', async () => {
    createFakeGitRepo(tempDir, 'some-repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const callArgs = mockRunAnalysis.mock.calls[0];
    expect(callArgs[4]).toBeUndefined();
  });

  it('reports directory scan count', async () => {
    // Create enough nested dirs to trigger the counter display
    createFakeGitRepo(tempDir, 'repo');
    process.cwd = () => tempDir;

    await batchCommand();

    const joined = output.join('\n');
    expect(joined).toContain('scanned');
    expect(joined).toContain('directories');
  });

  // ────────────────────────────────────────────
  // Annotation pass tests
  // ────────────────────────────────────────────

  describe('annotation pass', () => {
    /**
     * Helper: configure runAnalysis mock to populate the test DB
     * with commits and daily summaries so the annotation pass has data.
     */
    function setupAnnotationMock(dates: Array<{ date: string; commitMsg: string }> = [
      { date: '2025-06-01', commitMsg: 'feat: add new feature' },
      { date: '2025-06-02', commitMsg: 'fix: resolve bug' },
    ]): void {
      mockRunAnalysis.mockImplementation(async (_repoPath: string, repoId: number) => {
        let totalAdded = 0;
        let totalRemoved = 0;

        for (let i = 0; i < dates.length; i++) {
          const d = dates[i];
          insertCommit({
            repo_id: repoId,
            sha: `sha-${repoId}-${i}-${Date.now()}`,
            message: d.commitMsg,
            author: 'test@example.com',
            timestamp: `${d.date}T10:00:00`,
            lines_added: 100,
            lines_removed: 10,
            files_changed: 5,
          });
          upsertDailySummary({
            repo_id: repoId,
            date: d.date,
            commits_count: 1,
            lines_added: 100,
            lines_removed: 10,
            files_touched: 5,
          });
          totalAdded += 100;
          totalRemoved += 10;
        }

        return {
          totalCommits: dates.length,
          firstCommitDate: `${dates[0].date}T10:00:00Z`,
          linesAdded: totalAdded,
          linesRemoved: totalRemoved,
          filesTracked: 5,
          branchCount: 1,
          authorCount: 1,
          daysActive: dates.length,
        };
      });
    }

    it('does not run annotation pass when --annotate is not set', async () => {
      setupAnnotationMock();
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand();

      const repos = getAllRepos();
      const summaries = getAllDailySummaries(repos[0].id);
      // ai_draft should remain null
      expect(summaries.every((s) => s.ai_draft === null)).toBe(true);
      const joined = output.join('\n');
      expect(joined).not.toContain('Annotation Pass');
    });

    it('generates ai_draft for unannotated days with --annotate --auto', async () => {
      setupAnnotationMock();
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const repos = getAllRepos();
      const summaries = getAllDailySummaries(repos[0].id);
      expect(summaries).toHaveLength(2);
      for (const s of summaries) {
        expect(s.ai_draft).not.toBeNull();
        expect(s.ai_draft!.length).toBeGreaterThan(0);
        // Template digest should contain "What I built"
        expect(s.ai_draft).toContain('What I built');
      }
    });

    it('generates template digest with transformed commit messages', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: user authentication' },
      ]);
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const repos = getAllRepos();
      const summary = getDailySummary(repos[0].id, '2025-06-01');
      expect(summary!.ai_draft).toContain('Added user authentication');
      expect(summary!.ai_draft).toContain('Stats');
    });

    it('skips days with existing ai_draft without --overwrite', async () => {
      // Mock sets up one day with existing ai_draft, one without
      mockRunAnalysis.mockImplementation(async (_rp: string, repoId: number) => {
        insertCommit({
          repo_id: repoId, sha: `skip-test-1-${Date.now()}`,
          message: 'feat: existing work', author: 'test@example.com',
          timestamp: '2025-06-01T10:00:00', lines_added: 100, lines_removed: 10, files_changed: 5,
        });
        insertCommit({
          repo_id: repoId, sha: `skip-test-2-${Date.now()}`,
          message: 'fix: new work', author: 'test@example.com',
          timestamp: '2025-06-02T10:00:00', lines_added: 50, lines_removed: 5, files_changed: 3,
        });
        upsertDailySummary({
          repo_id: repoId, date: '2025-06-01', commits_count: 1,
          lines_added: 100, lines_removed: 10, files_touched: 5, ai_draft: 'Existing annotation',
        });
        upsertDailySummary({
          repo_id: repoId, date: '2025-06-02', commits_count: 1,
          lines_added: 50, lines_removed: 5, files_touched: 3,
        });
        return {
          totalCommits: 2, firstCommitDate: '2025-06-01T10:00:00Z',
          linesAdded: 150, linesRemoved: 15, filesTracked: 8,
          branchCount: 1, authorCount: 1, daysActive: 2,
        };
      });
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const repos = getAllRepos();
      const repoId = repos[0].id;

      // The pre-existing annotation should be preserved
      const s1 = getDailySummary(repoId, '2025-06-01');
      expect(s1!.ai_draft).toBe('Existing annotation');

      // The other day should be annotated
      const s2 = getDailySummary(repoId, '2025-06-02');
      expect(s2!.ai_draft).not.toBeNull();
      expect(s2!.ai_draft).toContain('What I built');
    });

    it('overwrites existing ai_draft with --overwrite', async () => {
      // Mock sets up a day with existing ai_draft
      mockRunAnalysis.mockImplementation(async (_rp: string, repoId: number) => {
        insertCommit({
          repo_id: repoId, sha: `overwrite-test-${Date.now()}`,
          message: 'feat: some work', author: 'test@example.com',
          timestamp: '2025-06-01T10:00:00', lines_added: 100, lines_removed: 10, files_changed: 5,
        });
        upsertDailySummary({
          repo_id: repoId, date: '2025-06-01', commits_count: 1,
          lines_added: 100, lines_removed: 10, files_touched: 5, ai_draft: 'Old annotation',
        });
        return {
          totalCommits: 1, firstCommitDate: '2025-06-01T10:00:00Z',
          linesAdded: 100, linesRemoved: 10, filesTracked: 5,
          branchCount: 1, authorCount: 1, daysActive: 1,
        };
      });
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true, overwrite: true });

      const repos = getAllRepos();
      const s1 = getDailySummary(repos[0].id, '2025-06-01');
      // Should be overwritten with new template digest
      expect(s1!.ai_draft).not.toBe('Old annotation');
      expect(s1!.ai_draft).toContain('What I built');
    });

    it('shows annotation summary in output', async () => {
      setupAnnotationMock();
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const joined = output.join('\n');
      expect(joined).toContain('Annotation Pass');
      expect(joined).toContain('Annotation Summary');
      expect(joined).toContain('Annotated:');
      expect(joined).toContain('2 days');
    });

    it('shows "all days already annotated" when nothing to annotate', async () => {
      // Mock sets up all days as already annotated
      mockRunAnalysis.mockImplementation(async (_rp: string, repoId: number) => {
        insertCommit({
          repo_id: repoId, sha: `annotated-test-${Date.now()}`,
          message: 'feat: done', author: 'test@example.com',
          timestamp: '2025-06-01T10:00:00', lines_added: 50, lines_removed: 5, files_changed: 2,
        });
        upsertDailySummary({
          repo_id: repoId, date: '2025-06-01', commits_count: 1,
          lines_added: 50, lines_removed: 5, files_touched: 2, ai_draft: 'Already done',
        });
        return {
          totalCommits: 1, firstCommitDate: '2025-06-01T10:00:00Z',
          linesAdded: 50, linesRemoved: 5, filesTracked: 2,
          branchCount: 1, authorCount: 1, daysActive: 1,
        };
      });
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const joined = output.join('\n');
      expect(joined).toContain('all days already annotated');
    });

    it('shows template mode indicator', async () => {
      setupAnnotationMock();
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const joined = output.join('\n');
      expect(joined).toContain('template mode');
    });

    it('annotates across multiple repos', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: repo work' },
      ]);
      createFakeGitRepo(tempDir, 'repo-a');
      createFakeGitRepo(tempDir, 'repo-b');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const repos = getAllRepos();
      expect(repos).toHaveLength(2);
      for (const repo of repos) {
        const summaries = getAllDailySummaries(repo.id);
        expect(summaries.length).toBeGreaterThan(0);
        expect(summaries[0].ai_draft).toContain('What I built');
      }

      const joined = output.join('\n');
      expect(joined).toContain('Annotated:');
    });

    // ── Interactive mode tests ──

    it('annotates when user answers y in interactive mode', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: something' },
      ]);
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('y'));

      await batchCommand({ annotate: true });

      const repos = getAllRepos();
      const summary = getDailySummary(repos[0].id, '2025-06-01');
      expect(summary!.ai_draft).toContain('What I built');
      expect(mockQuestion).toHaveBeenCalledTimes(1);
    });

    it('skips when user answers n in interactive mode', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: something' },
      ]);
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('n'));

      await batchCommand({ annotate: true });

      const repos = getAllRepos();
      const summary = getDailySummary(repos[0].id, '2025-06-01');
      expect(summary!.ai_draft).toBeNull();

      const joined = output.join('\n');
      expect(joined).toContain('Skipped:');
      expect(joined).toContain('1');
    });

    it('switches to auto mode when user answers "all"', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: first' },
        { date: '2025-06-02', commitMsg: 'feat: second' },
      ]);
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;
      // User answers "all" on first prompt — should not prompt again
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('all'));

      await batchCommand({ annotate: true });

      const repos = getAllRepos();
      const s1 = getDailySummary(repos[0].id, '2025-06-01');
      const s2 = getDailySummary(repos[0].id, '2025-06-02');
      expect(s1!.ai_draft).toContain('What I built');
      expect(s2!.ai_draft).toContain('What I built');
      // Only prompted once (for the first day), then auto for the rest
      expect(mockQuestion).toHaveBeenCalledTimes(1);
    });

    it('skips remaining days when user answers "skip"', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: first' },
        { date: '2025-06-02', commitMsg: 'feat: second' },
      ]);
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('skip'));

      await batchCommand({ annotate: true });

      const repos = getAllRepos();
      const s1 = getDailySummary(repos[0].id, '2025-06-01');
      const s2 = getDailySummary(repos[0].id, '2025-06-02');
      expect(s1!.ai_draft).toBeNull();
      expect(s2!.ai_draft).toBeNull();
      // Only prompted once
      expect(mockQuestion).toHaveBeenCalledTimes(1);

      const joined = output.join('\n');
      expect(joined).toContain('Skipping remaining days');
    });

    it('shows commit preview in interactive mode', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: add login page' },
      ]);
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;
      mockQuestion.mockImplementation((_q: string, cb: (answer: string) => void) => cb('y'));

      await batchCommand({ annotate: true });

      const joined = output.join('\n');
      expect(joined).toContain('2025-06-01');
      expect(joined).toContain('1 commit');
      expect(joined).toContain('feat: add login page');
    });

    it('falls back to template when Ollama is configured but unreachable', async () => {
      setupAnnotationMock([
        { date: '2025-06-01', commitMsg: 'feat: something' },
      ]);
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

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

      // Ollama connectivity check fails
      mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await batchCommand({ annotate: true, auto: true });

      const joined = output.join('\n');
      expect(joined).toContain('Ollama not available');
      expect(joined).toContain('template mode');

      // Should still annotate using template
      const repos = getAllRepos();
      const summary = getDailySummary(repos[0].id, '2025-06-01');
      expect(summary!.ai_draft).toContain('What I built');
    });

    it('does not overwrite user_notes during annotation', async () => {
      // Mock sets up a day with user_notes but no ai_draft
      mockRunAnalysis.mockImplementation(async (_rp: string, repoId: number) => {
        insertCommit({
          repo_id: repoId, sha: `notes-test-${Date.now()}`,
          message: 'feat: something', author: 'test@example.com',
          timestamp: '2025-06-01T10:00:00', lines_added: 80, lines_removed: 8, files_changed: 4,
        });
        upsertDailySummary({
          repo_id: repoId, date: '2025-06-01', commits_count: 1,
          lines_added: 80, lines_removed: 8, files_touched: 4, user_notes: 'My manual notes',
        });
        return {
          totalCommits: 1, firstCommitDate: '2025-06-01T10:00:00Z',
          linesAdded: 80, linesRemoved: 8, filesTracked: 4,
          branchCount: 1, authorCount: 1, daysActive: 1,
        };
      });
      createFakeGitRepo(tempDir, 'repo');
      process.cwd = () => tempDir;

      await batchCommand({ annotate: true, auto: true });

      const repos = getAllRepos();
      const summary = getDailySummary(repos[0].id, '2025-06-01');
      // user_notes should be preserved
      expect(summary!.user_notes).toBe('My manual notes');
      // ai_draft should be populated
      expect(summary!.ai_draft).toContain('What I built');
    });
  });
});
