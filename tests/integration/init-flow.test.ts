import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';
import { createTestRepo, addTestCommit } from '../helpers/test-repo.js';

// Mock getDb so all DB operations use our in-memory database
vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Mock readline to auto-press ENTER
vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (_q: string, cb: (answer: string) => void) => cb(''),
    close: () => {},
  }),
}));

// Mock the dash command (called at the end of init)
vi.mock('../../src/commands/dash.js', () => ({
  dashCommand: vi.fn().mockResolvedValue(undefined),
}));

// Mock the worker-based analysis to avoid spawning a real Worker thread
const mockRunAnalysis = vi.fn();
vi.mock('../../src/workers/run-analysis.js', () => ({
  runAnalysis: (...args: any[]) => mockRunAnalysis(...args),
}));

// Import after mocks are set up
import { initCommand } from '../../src/commands/init.js';
import { getRepo, getAllRepos } from '../../src/db/repos.js';
import { installPostCommitHook, isHookInstalled } from '../../src/git/hooks.js';
import { loadRepoConfig } from '../../src/config/index.js';

describe('init-flow integration', () => {
  let repoPath: string;
  let cleanup: () => void;
  let output: string[] = [];
  const originalLog = console.log;
  const originalCwd = process.cwd;

  beforeEach(async () => {
    setupTestDb();
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    mockExit.mockClear();
    mockRunAnalysis.mockReset();

    // Create a real temporary git repo
    const repo = await createTestRepo();
    repoPath = repo.path;
    cleanup = repo.cleanup;

    // Add a few commits to the test repo
    await addTestCommit(repoPath, 'README.md', '# Test Project', 'Initial commit');
    // Create src/ subdirectory before writing files into it
    mkdirSync(join(repoPath, 'src'), { recursive: true });
    await addTestCommit(repoPath, 'src/index.ts', 'console.log("hello")', 'feat: add entry point');
    await addTestCommit(repoPath, 'src/utils.ts', 'export const add = (a: number, b: number) => a + b;', 'feat: add utility functions');

    // Mock process.cwd to return the test repo path
    process.cwd = () => repoPath;

    // Mock runAnalysis to return reasonable stats
    mockRunAnalysis.mockResolvedValue({
      totalCommits: 3,
      firstCommitDate: '2025-01-01T10:00:00Z',
      linesAdded: 50,
      linesRemoved: 5,
      filesTracked: 3,
      branchCount: 1,
      authorCount: 1,
      daysActive: 1,
    });
  });

  afterEach(() => {
    console.log = originalLog;
    process.cwd = originalCwd;
    teardownTestDb();
    try {
      cleanup();
    } catch {
      // Cleanup may fail on Windows if files are locked
    }
  });

  it('creates .worktale/ directory in the repo', async () => {
    await initCommand();

    const worktaleDir = join(repoPath, '.worktale');
    expect(existsSync(worktaleDir)).toBe(true);
  });

  it('creates .worktale/config.json with correct structure', async () => {
    await initCommand();

    const configPath = join(repoPath, '.worktale', 'config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.initialized).toBe(true);
    expect(config.repoId).toBeGreaterThan(0);
    expect(config.lastAnalysis).toBeTruthy();
  });

  it('installs post-commit hook in .git/hooks/', async () => {
    await initCommand();

    const hookPath = join(repoPath, '.git', 'hooks', 'post-commit');
    expect(existsSync(hookPath)).toBe(true);

    const hookContent = readFileSync(hookPath, 'utf-8');
    expect(hookContent).toContain('worktale');
  });

  it('registers the repo in the database', async () => {
    await initCommand();

    const repo = getRepo(repoPath);
    expect(repo).toBeDefined();
    expect(repo!.path).toBe(repoPath);
  });

  it('calls runAnalysis with correct arguments', async () => {
    await initCommand();

    expect(mockRunAnalysis).toHaveBeenCalledTimes(1);
    const [callPath, callRepoId] = mockRunAnalysis.mock.calls[0];
    expect(callPath).toBe(repoPath);
    expect(callRepoId).toBeGreaterThan(0);
  });

  it('displays summary stats after analysis', async () => {
    await initCommand();

    const joined = output.join('\n');
    expect(joined).toContain('Analysis complete');
    expect(joined).toContain('Commits:');
    expect(joined).toContain('Lines added:');
    expect(joined).toContain('Worktale is ready');
  });

  it('shows git detected message', async () => {
    await initCommand();

    const joined = output.join('\n');
    expect(joined).toContain('git detected');
  });

  it('adds .worktale/ to .gitignore', async () => {
    await initCommand();

    const gitignorePath = join(repoPath, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);

    const content = readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.worktale/');
  });

  it('fails with error when not in a git repo', async () => {
    // Point cwd to a non-git directory
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const nonGitPath = mkdtempSync(join(tmpdir(), 'worktale-no-git-'));
    process.cwd = () => nonGitPath;

    const errOutput: string[] = [];
    const origErr = console.error;
    console.error = (...args: any[]) => errOutput.push(args.join(' '));

    await initCommand();

    console.error = origErr;

    const joined = output.join('\n');
    expect(joined).toContain('Not a git repository');
    expect(mockExit).toHaveBeenCalledWith(1);

    rmSync(nonGitPath, { recursive: true, force: true });
  });
});
