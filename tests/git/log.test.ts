import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simpleGit } from 'simple-git';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestRepo, addTestCommit } from '../helpers/test-repo.js';
import {
  getCommitLog,
  getLatestCommit,
  getCommitCount,
  getFirstCommitDate,
  getBranches,
  getTags,
  getCurrentBranch,
  getCurrentUserEmail,
  getFileCount,
} from '../../src/git/log.js';

/*
 * These tests use a real (temporary) git repository.
 * A small set of commits is created in beforeAll so every test reads
 * deterministic data.
 */

let repoPath: string;
let cleanup: () => void;
let firstCommitSha: string;
let secondCommitSha: string;
let thirdCommitSha: string;

beforeAll(async () => {
  const repo = await createTestRepo();
  repoPath = repo.path;
  cleanup = repo.cleanup;

  // Commit 1 — single file
  firstCommitSha = await addTestCommit(
    repoPath,
    'README.md',
    '# Hello World\n',
    'Initial commit',
  );

  // Commit 2 — add a source file
  mkdirSync(join(repoPath, 'src'), { recursive: true });
  secondCommitSha = await addTestCommit(
    repoPath,
    'src/index.ts',
    'console.log("hello");\nconsole.log("world");\n',
    'Add index',
  );

  // Commit 3 — modify existing file and add another
  writeFileSync(join(repoPath, 'README.md'), '# Hello World\n\nUpdated readme.\n');
  writeFileSync(join(repoPath, 'src/util.ts'), 'export const x = 1;\n');
  const git = simpleGit(repoPath);
  await git.add(['README.md', 'src/util.ts']);
  const result = await git.commit('Update readme and add util');
  thirdCommitSha = result.commit;
});

afterAll(() => {
  cleanup();
});

// ---------- getCommitLog ----------

describe('getCommitLog', () => {
  it('returns all commits in the repo', async () => {
    const commits = await getCommitLog(repoPath);
    expect(commits.length).toBe(3);
  });

  it('returns commits with correct fields', async () => {
    const commits = await getCommitLog(repoPath);
    // Commits come in newest-first order from git log
    const latest = commits[0];

    expect(latest.sha).toMatch(/^[0-9a-f]{40}$/i);
    expect(latest.message).toBe('Update readme and add util');
    expect(latest.author).toBe('Test User');
    expect(latest.authorEmail).toBe('test@example.com');
    expect(latest.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    expect(latest.isMerge).toBe(false);
    expect(Array.isArray(latest.filePaths)).toBe(true);
    expect(Array.isArray(latest.tags)).toBe(true);
  });

  it('parses numstat (linesAdded / linesRemoved / filePaths)', async () => {
    const commits = await getCommitLog(repoPath);
    // The latest commit modified README.md and added src/util.ts
    const latest = commits[0];
    expect(latest.filePaths.length).toBeGreaterThanOrEqual(2);
    expect(latest.filesChanged).toBe(latest.filePaths.length);
    expect(latest.linesAdded).toBeGreaterThan(0);
  });

  it('respects maxCount option', async () => {
    const commits = await getCommitLog(repoPath, { maxCount: 1 });
    expect(commits.length).toBe(1);
    expect(commits[0].message).toBe('Update readme and add util');
  });

  it('respects author filter', async () => {
    const commits = await getCommitLog(repoPath, { author: 'Test User' });
    expect(commits.length).toBe(3);

    const none = await getCommitLog(repoPath, { author: 'nobody@nowhere.com' });
    expect(none.length).toBe(0);
  });

  it('returns commits in newest-first order', async () => {
    const commits = await getCommitLog(repoPath);
    for (let i = 1; i < commits.length; i++) {
      const newer = new Date(commits[i - 1].timestamp).getTime();
      const older = new Date(commits[i].timestamp).getTime();
      expect(newer).toBeGreaterThanOrEqual(older);
    }
  });
});

// ---------- getLatestCommit ----------

describe('getLatestCommit', () => {
  it('returns the most recent commit', async () => {
    const latest = await getLatestCommit(repoPath);
    expect(latest).not.toBeNull();
    expect(latest!.message).toBe('Update readme and add util');
  });

  it('throws for an empty repo (no commits)', async () => {
    const emptyRepo = await createTestRepo();
    try {
      // getLatestCommit -> getCommitLog -> git.raw(['log', ...])
      // simple-git throws on `git log` in a repo with zero commits
      await expect(getLatestCommit(emptyRepo.path)).rejects.toThrow();
    } finally {
      emptyRepo.cleanup();
    }
  });
});

// ---------- getCommitCount ----------

describe('getCommitCount', () => {
  it('returns the correct total commit count', async () => {
    const count = await getCommitCount(repoPath);
    expect(count).toBe(3);
  });

  it('returns 0 for empty repo', async () => {
    const emptyRepo = await createTestRepo();
    try {
      const count = await getCommitCount(emptyRepo.path);
      expect(count).toBe(0);
    } finally {
      emptyRepo.cleanup();
    }
  });

  it('filters by author', async () => {
    const count = await getCommitCount(repoPath, 'Test User');
    expect(count).toBe(3);

    const zero = await getCommitCount(repoPath, 'nobody');
    expect(zero).toBe(0);
  });
});

// ---------- getFirstCommitDate ----------

describe('getFirstCommitDate', () => {
  it('returns the earliest commit date as ISO string', async () => {
    const firstDate = await getFirstCommitDate(repoPath);
    expect(firstDate).not.toBeNull();
    expect(firstDate!).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns null for empty repo', async () => {
    const emptyRepo = await createTestRepo();
    try {
      const result = await getFirstCommitDate(emptyRepo.path);
      expect(result).toBeNull();
    } finally {
      emptyRepo.cleanup();
    }
  });

  it('filters by author', async () => {
    const date = await getFirstCommitDate(repoPath, 'Test User');
    expect(date).not.toBeNull();

    const noDate = await getFirstCommitDate(repoPath, 'nobody');
    expect(noDate).toBeNull();
  });
});

// ---------- getBranches ----------

describe('getBranches', () => {
  it('lists local branches', async () => {
    const branches = await getBranches(repoPath);
    expect(branches).toContain('master');
  });

  it('reflects newly created branches', async () => {
    const git = simpleGit(repoPath);
    await git.checkoutLocalBranch('feature-test');
    const branches = await getBranches(repoPath);
    expect(branches).toContain('feature-test');
    // Switch back to master
    await git.checkout('master');
  });
});

// ---------- getTags ----------

describe('getTags', () => {
  it('returns empty array when no tags exist', async () => {
    const emptyRepo = await createTestRepo();
    try {
      await addTestCommit(emptyRepo.path, 'file.txt', 'data', 'first');
      const tags = await getTags(emptyRepo.path);
      expect(tags).toEqual([]);
    } finally {
      emptyRepo.cleanup();
    }
  });

  it('returns tags with name and date', async () => {
    const git = simpleGit(repoPath);
    await git.addTag('v1.0.0');
    const tags = await getTags(repoPath);
    expect(tags.length).toBeGreaterThanOrEqual(1);
    const v1 = tags.find((t) => t.name === 'v1.0.0');
    expect(v1).toBeDefined();
    expect(v1!.date).toBeTruthy();
  });
});

// ---------- getCurrentBranch ----------

describe('getCurrentBranch', () => {
  it('returns the current branch name', async () => {
    const branch = await getCurrentBranch(repoPath);
    expect(branch).toBe('master');
  });

  it('returns "unknown" for a real directory that is not a repo', async () => {
    // simple-git throws synchronously if the path does not exist at all,
    // but for an existing non-repo dir, the try/catch in getCurrentBranch handles it.
    const nonRepoDir = mkdtempSync(join(tmpdir(), 'worktale-nonrepo-'));
    try {
      const branch = await getCurrentBranch(nonRepoDir);
      expect(branch).toBe('unknown');
    } finally {
      rmSync(nonRepoDir, { recursive: true, force: true });
    }
  });
});

// ---------- getCurrentUserEmail ----------

describe('getCurrentUserEmail', () => {
  it('returns the configured email', async () => {
    const email = await getCurrentUserEmail(repoPath);
    expect(email).toBe('test@example.com');
  });
});

// ---------- getFileCount ----------

describe('getFileCount', () => {
  it('returns the count of tracked files', async () => {
    const count = await getFileCount(repoPath);
    // We have: README.md, src/index.ts, src/util.ts
    expect(count).toBe(3);
  });

  it('returns 0 for empty repo', async () => {
    const emptyRepo = await createTestRepo();
    try {
      const count = await getFileCount(emptyRepo.path);
      expect(count).toBe(0);
    } finally {
      emptyRepo.cleanup();
    }
  });
});

// ---------- Merge commits ----------

describe('merge commit detection', () => {
  it('detects merge commits (isMerge = true)', async () => {
    const mergeRepo = await createTestRepo();
    try {
      const git = simpleGit(mergeRepo.path);

      // Create initial commit on master
      await addTestCommit(mergeRepo.path, 'base.txt', 'base', 'base commit');

      // Create and switch to a feature branch
      await git.checkoutLocalBranch('feature');
      await addTestCommit(mergeRepo.path, 'feature.txt', 'feature content', 'feature commit');

      // Switch back to master and create a diverging commit
      await git.checkout('master');
      await addTestCommit(mergeRepo.path, 'master.txt', 'master content', 'master commit');

      // Merge feature into master (creates a merge commit)
      await git.merge(['feature', '--no-ff', '-m', 'Merge feature branch']);

      const commits = await getCommitLog(mergeRepo.path);
      const mergeCommit = commits.find((c) => c.message === 'Merge feature branch');
      expect(mergeCommit).toBeDefined();
      expect(mergeCommit!.isMerge).toBe(true);

      // The non-merge commits should have isMerge = false
      const baseCommit = commits.find((c) => c.message === 'base commit');
      expect(baseCommit!.isMerge).toBe(false);
    } finally {
      mergeRepo.cleanup();
    }
  });
});

// ---------- Binary file numstat ----------

describe('binary file numstat', () => {
  it('handles binary files in numstat (- - path)', async () => {
    const binRepo = await createTestRepo();
    try {
      // Create a binary-like file (git treats it as binary based on content)
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      writeFileSync(join(binRepo.path, 'image.png'), binaryContent);
      const git = simpleGit(binRepo.path);
      await git.add('image.png');
      await git.commit('Add binary image');

      const commits = await getCommitLog(binRepo.path);
      expect(commits.length).toBe(1);
      const commit = commits[0];
      // Binary files show as -\t-\tpath, which our parser handles
      expect(commit.filePaths).toContain('image.png');
      expect(commit.filesChanged).toBe(1);
      // Binary file should not add to linesAdded/linesRemoved
      expect(commit.linesAdded).toBe(0);
      expect(commit.linesRemoved).toBe(0);
    } finally {
      binRepo.cleanup();
    }
  });
});
