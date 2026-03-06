import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

import {
  insertCommit,
  insertCommitsBatch,
  getCommitsByDate,
  getCommitsByDateRange,
  getRecentCommits,
  getCommitCount,
  getLatestCommitSha,
  commitExists,
} from '../../src/db/commits.js';
import type { CommitInsert } from '../../src/db/commits.js';

// Helper: seed a repo and return its id.
function seedRepo(path = '/repo', name = 'repo'): number {
  const db = getTestDb();
  const result = db
    .prepare("INSERT INTO repos (path, name, first_seen, last_synced) VALUES (?, ?, datetime('now'), datetime('now'))")
    .run(path, name);
  return Number(result.lastInsertRowid);
}

describe('commits', () => {
  let repoId: number;

  beforeEach(() => {
    setupTestDb();
    repoId = seedRepo();
  });

  afterEach(() => {
    teardownTestDb();
  });

  // ---------- insertCommit ----------

  describe('insertCommit', () => {
    it('inserts a commit and returns its id', () => {
      const id = insertCommit({
        repo_id: repoId,
        sha: 'abc123',
        timestamp: '2025-06-01T10:00:00Z',
        message: 'initial commit',
        author: 'Alice',
      });
      expect(id).toBeGreaterThan(0);
    });

    it('stores all fields correctly', () => {
      const id = insertCommit({
        repo_id: repoId,
        sha: 'def456',
        timestamp: '2025-06-01T12:00:00Z',
        message: 'feat: add widget',
        author: 'Bob',
        lines_added: 100,
        lines_removed: 20,
        files_changed: 5,
        branch: 'main',
        is_merge: true,
        tags: 'v1.0',
      });

      const row = getTestDb().prepare('SELECT * FROM commits WHERE id = ?').get(id) as Record<string, unknown>;
      expect(row.sha).toBe('def456');
      expect(row.message).toBe('feat: add widget');
      expect(row.author).toBe('Bob');
      expect(row.lines_added).toBe(100);
      expect(row.lines_removed).toBe(20);
      expect(row.files_changed).toBe(5);
      expect(row.branch).toBe('main');
      expect(row.is_merge).toBe(1);
      expect(row.tags).toBe('v1.0');
    });

    it('defaults optional numeric fields to 0 and others to null', () => {
      const id = insertCommit({
        repo_id: repoId,
        sha: 'minimal',
        timestamp: '2025-06-01T08:00:00Z',
      });

      const row = getTestDb().prepare('SELECT * FROM commits WHERE id = ?').get(id) as Record<string, unknown>;
      expect(row.message).toBeNull();
      expect(row.author).toBeNull();
      expect(row.lines_added).toBe(0);
      expect(row.lines_removed).toBe(0);
      expect(row.files_changed).toBe(0);
      expect(row.branch).toBeNull();
      expect(row.is_merge).toBe(0);
      expect(row.tags).toBeNull();
    });

    it('throws on duplicate (repo_id, sha)', () => {
      insertCommit({ repo_id: repoId, sha: 'dup', timestamp: '2025-06-01T10:00:00Z' });
      expect(() =>
        insertCommit({ repo_id: repoId, sha: 'dup', timestamp: '2025-06-01T11:00:00Z' }),
      ).toThrow();
    });
  });

  // ---------- insertCommitsBatch ----------

  describe('insertCommitsBatch', () => {
    it('inserts multiple commits in one call', () => {
      const commits: CommitInsert[] = Array.from({ length: 10 }, (_, i) => ({
        repo_id: repoId,
        sha: `sha-${i}`,
        timestamp: `2025-06-01T${String(i).padStart(2, '0')}:00:00Z`,
      }));

      insertCommitsBatch(repoId, commits);
      expect(getCommitCount(repoId)).toBe(10);
    });

    it('handles empty array without error', () => {
      insertCommitsBatch(repoId, []);
      expect(getCommitCount(repoId)).toBe(0);
    });

    it('silently ignores duplicate commits (INSERT OR IGNORE)', () => {
      insertCommit({ repo_id: repoId, sha: 'existing', timestamp: '2025-06-01T00:00:00Z' });

      const commits: CommitInsert[] = [
        { repo_id: repoId, sha: 'existing', timestamp: '2025-06-01T01:00:00Z' },
        { repo_id: repoId, sha: 'new-one', timestamp: '2025-06-01T02:00:00Z' },
      ];
      insertCommitsBatch(repoId, commits);

      expect(getCommitCount(repoId)).toBe(2); // existing + new-one
    });

    it('handles more than 500 commits (multi-batch)', () => {
      const commits: CommitInsert[] = Array.from({ length: 600 }, (_, i) => ({
        repo_id: repoId,
        sha: `batch-sha-${i}`,
        timestamp: '2025-06-01T00:00:00Z',
      }));

      insertCommitsBatch(repoId, commits);
      expect(getCommitCount(repoId)).toBe(600);
    });
  });

  // ---------- getCommitsByDate ----------

  describe('getCommitsByDate', () => {
    beforeEach(() => {
      insertCommit({ repo_id: repoId, sha: 'c1', timestamp: '2025-06-01T09:00:00Z' });
      insertCommit({ repo_id: repoId, sha: 'c2', timestamp: '2025-06-01T15:00:00Z' });
      insertCommit({ repo_id: repoId, sha: 'c3', timestamp: '2025-06-02T10:00:00Z' });
    });

    it('returns commits for the given date', () => {
      const result = getCommitsByDate(repoId, '2025-06-01');
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.sha)).toEqual(['c1', 'c2']);
    });

    it('returns empty when no commits match', () => {
      expect(getCommitsByDate(repoId, '2025-12-25')).toEqual([]);
    });

    it('orders by timestamp ascending', () => {
      const result = getCommitsByDate(repoId, '2025-06-01');
      expect(result[0].sha).toBe('c1');
      expect(result[1].sha).toBe('c2');
    });
  });

  // ---------- getCommitsByDateRange ----------

  describe('getCommitsByDateRange', () => {
    beforeEach(() => {
      insertCommit({ repo_id: repoId, sha: 'r1', timestamp: '2025-06-01T10:00:00Z' });
      insertCommit({ repo_id: repoId, sha: 'r2', timestamp: '2025-06-02T10:00:00Z' });
      insertCommit({ repo_id: repoId, sha: 'r3', timestamp: '2025-06-03T10:00:00Z' });
      insertCommit({ repo_id: repoId, sha: 'r4', timestamp: '2025-06-04T10:00:00Z' });
    });

    it('returns commits within the date range (inclusive)', () => {
      const result = getCommitsByDateRange(repoId, '2025-06-02', '2025-06-03');
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.sha)).toEqual(['r2', 'r3']);
    });

    it('returns empty when range has no commits', () => {
      expect(getCommitsByDateRange(repoId, '2025-07-01', '2025-07-31')).toEqual([]);
    });

    it('handles single-day range', () => {
      const result = getCommitsByDateRange(repoId, '2025-06-01', '2025-06-01');
      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('r1');
    });
  });

  // ---------- getRecentCommits ----------

  describe('getRecentCommits', () => {
    beforeEach(() => {
      for (let i = 0; i < 5; i++) {
        insertCommit({
          repo_id: repoId,
          sha: `recent-${i}`,
          timestamp: `2025-06-01T${String(10 + i).padStart(2, '0')}:00:00Z`,
        });
      }
    });

    it('returns commits ordered by timestamp descending', () => {
      const result = getRecentCommits(repoId, 5);
      expect(result[0].sha).toBe('recent-4');
      expect(result[4].sha).toBe('recent-0');
    });

    it('respects the limit', () => {
      const result = getRecentCommits(repoId, 2);
      expect(result).toHaveLength(2);
    });

    it('returns all commits when limit exceeds count', () => {
      const result = getRecentCommits(repoId, 100);
      expect(result).toHaveLength(5);
    });
  });

  // ---------- getCommitCount ----------

  describe('getCommitCount', () => {
    it('returns 0 for a repo with no commits', () => {
      expect(getCommitCount(repoId)).toBe(0);
    });

    it('returns the correct count', () => {
      insertCommit({ repo_id: repoId, sha: 'a', timestamp: '2025-06-01T10:00:00Z' });
      insertCommit({ repo_id: repoId, sha: 'b', timestamp: '2025-06-01T11:00:00Z' });
      expect(getCommitCount(repoId)).toBe(2);
    });

    it('does not count commits from other repos', () => {
      const otherRepoId = seedRepo('/other', 'other');
      insertCommit({ repo_id: repoId, sha: 'mine', timestamp: '2025-06-01T10:00:00Z' });
      insertCommit({ repo_id: otherRepoId, sha: 'theirs', timestamp: '2025-06-01T10:00:00Z' });
      expect(getCommitCount(repoId)).toBe(1);
    });
  });

  // ---------- getLatestCommitSha ----------

  describe('getLatestCommitSha', () => {
    it('returns null when no commits exist', () => {
      expect(getLatestCommitSha(repoId)).toBeNull();
    });

    it('returns the sha of the most recent commit', () => {
      insertCommit({ repo_id: repoId, sha: 'old', timestamp: '2025-06-01T08:00:00Z' });
      insertCommit({ repo_id: repoId, sha: 'new', timestamp: '2025-06-01T18:00:00Z' });
      expect(getLatestCommitSha(repoId)).toBe('new');
    });
  });

  // ---------- commitExists ----------

  describe('commitExists', () => {
    it('returns true when the commit exists', () => {
      insertCommit({ repo_id: repoId, sha: 'exists', timestamp: '2025-06-01T10:00:00Z' });
      expect(commitExists(repoId, 'exists')).toBe(true);
    });

    it('returns false when the commit does not exist', () => {
      expect(commitExists(repoId, 'nope')).toBe(false);
    });

    it('is scoped to the repo', () => {
      const otherRepoId = seedRepo('/other', 'other');
      insertCommit({ repo_id: otherRepoId, sha: 'scoped', timestamp: '2025-06-01T10:00:00Z' });
      expect(commitExists(repoId, 'scoped')).toBe(false);
      expect(commitExists(otherRepoId, 'scoped')).toBe(true);
    });
  });
});
