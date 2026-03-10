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

// Import after mocks
import { batchCommand } from '../../src/commands/batch.js';
import { getAllRepos } from '../../src/db/repos.js';

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
});
