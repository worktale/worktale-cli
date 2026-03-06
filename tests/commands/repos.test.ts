import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { reposCommand } from '../../src/commands/repos.js';
import { addRepo } from '../../src/db/repos.js';
import { insertCommit } from '../../src/db/commits.js';

describe('reposCommand', () => {
  let output: string[] = [];
  const originalLog = console.log;

  beforeEach(() => {
    setupTestDb();
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    mockExit.mockClear();
  });

  afterEach(() => {
    console.log = originalLog;
    teardownTestDb();
  });

  it('shows "no repos" when none are tracked', async () => {
    await reposCommand();

    const joined = output.join('\n');
    expect(joined).toContain('No repos tracked yet');
    expect(joined).toContain('worktale init');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('lists repos with correct info', async () => {
    addRepo('/home/user/project-alpha', 'project-alpha');
    addRepo('/home/user/project-beta', 'project-beta');

    await reposCommand();

    const joined = output.join('\n');
    expect(joined).toContain('project-alpha');
    expect(joined).toContain('project-beta');
    expect(joined).toContain('/home/user/project-alpha');
    expect(joined).toContain('/home/user/project-beta');
    expect(joined).toContain('2 repos tracked');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "1 repo tracked" for a single repo', async () => {
    addRepo('/home/user/solo', 'solo');

    await reposCommand();

    const joined = output.join('\n');
    expect(joined).toContain('1 repo tracked');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows commit counts', async () => {
    const repoId = addRepo('/home/user/project', 'project');

    // Insert some commits
    insertCommit({
      repo_id: repoId,
      sha: 'aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111',
      message: 'first commit',
      author: 'tester',
      timestamp: '2025-01-15T10:00:00',
    });
    insertCommit({
      repo_id: repoId,
      sha: 'bbbb2222bbbb2222bbbb2222bbbb2222bbbb2222',
      message: 'second commit',
      author: 'tester',
      timestamp: '2025-01-15T11:00:00',
    });

    await reposCommand();

    const joined = output.join('\n');
    expect(joined).toContain('2 commits');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows last synced information', async () => {
    addRepo('/home/user/project', 'project');

    await reposCommand();

    const joined = output.join('\n');
    // last_synced is set automatically by addRepo
    expect(joined).toContain('Last synced:');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('displays the WORKTALE REPOS header', async () => {
    await reposCommand();

    const joined = output.join('\n');
    expect(joined).toContain('WORKTALE REPOS');
  });
});
