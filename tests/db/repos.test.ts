import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

// Mock getDb so every module-under-test uses the in-memory database.
vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

// Import *after* the mock is registered so the mock takes effect.
import { addRepo, getRepo, getRepoById, getAllRepos, updateLastSynced } from '../../src/db/repos.js';

describe('repos', () => {
  beforeEach(() => {
    setupTestDb();
  });

  afterEach(() => {
    teardownTestDb();
  });

  // ---------- addRepo ----------

  describe('addRepo', () => {
    it('inserts a new repo and returns its id', () => {
      const id = addRepo('/home/user/project', 'project');
      expect(id).toBeGreaterThan(0);
    });

    it('returns different ids for different repos', () => {
      const id1 = addRepo('/home/user/a', 'a');
      const id2 = addRepo('/home/user/b', 'b');
      expect(id1).not.toBe(id2);
    });

    it('upserts on duplicate path – updates name and last_synced', () => {
      const id1 = addRepo('/home/user/project', 'old-name');
      const id2 = addRepo('/home/user/project', 'new-name');

      // Should resolve to the same logical repo
      const repo = getRepo('/home/user/project');
      expect(repo).toBeDefined();
      expect(repo!.name).toBe('new-name');
      // The id returned on conflict may differ depending on SQLite behaviour,
      // but the stored row must be the same.
      expect(repo!.id).toBe(id1);
    });

    it('sets first_seen and last_synced to ISO timestamps', () => {
      addRepo('/home/user/project', 'project');
      const repo = getRepo('/home/user/project');
      expect(repo).toBeDefined();
      expect(repo!.first_seen).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(repo!.last_synced).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ---------- getRepo ----------

  describe('getRepo', () => {
    it('returns the repo for an existing path', () => {
      addRepo('/home/user/project', 'project');
      const repo = getRepo('/home/user/project');
      expect(repo).toBeDefined();
      expect(repo!.path).toBe('/home/user/project');
      expect(repo!.name).toBe('project');
    });

    it('returns undefined for a non-existent path', () => {
      const repo = getRepo('/no/such/path');
      expect(repo).toBeUndefined();
    });
  });

  // ---------- getRepoById ----------

  describe('getRepoById', () => {
    it('returns the repo for an existing id', () => {
      const id = addRepo('/home/user/project', 'project');
      const repo = getRepoById(id);
      expect(repo).toBeDefined();
      expect(repo!.id).toBe(id);
      expect(repo!.name).toBe('project');
    });

    it('returns undefined for a non-existent id', () => {
      const repo = getRepoById(999);
      expect(repo).toBeUndefined();
    });
  });

  // ---------- getAllRepos ----------

  describe('getAllRepos', () => {
    it('returns an empty array when no repos exist', () => {
      expect(getAllRepos()).toEqual([]);
    });

    it('returns all repos ordered by name', () => {
      addRepo('/z', 'zeta');
      addRepo('/a', 'alpha');
      addRepo('/m', 'mu');

      const repos = getAllRepos();
      expect(repos).toHaveLength(3);
      expect(repos.map((r) => r.name)).toEqual(['alpha', 'mu', 'zeta']);
    });
  });

  // ---------- updateLastSynced ----------

  describe('updateLastSynced', () => {
    it('updates the last_synced timestamp', async () => {
      const id = addRepo('/home/user/project', 'project');
      const before = getRepoById(id)!.last_synced;

      // Ensure at least 1 ms passes so timestamps differ.
      await new Promise((r) => setTimeout(r, 10));

      updateLastSynced(id);
      const after = getRepoById(id)!.last_synced;

      expect(after).not.toBe(before);
      expect(after).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('does nothing for a non-existent repo (no error)', () => {
      // Should not throw
      expect(() => updateLastSynced(999)).not.toThrow();
    });
  });
});
