import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

import {
  insertFileActivity,
  insertFileActivityBatch,
  getModuleActivity,
  getModuleActivityByDate,
  getTopModules,
} from '../../src/db/file-activity.js';
import type { FileActivityInsert } from '../../src/db/file-activity.js';

// Helper: seed a repo and return its id.
function seedRepo(path = '/repo', name = 'repo'): number {
  const db = getTestDb();
  const result = db
    .prepare("INSERT INTO repos (path, name, first_seen, last_synced) VALUES (?, ?, datetime('now'), datetime('now'))")
    .run(path, name);
  return Number(result.lastInsertRowid);
}

describe('file-activity', () => {
  let repoId: number;

  beforeEach(() => {
    setupTestDb();
    repoId = seedRepo();
  });

  afterEach(() => {
    teardownTestDb();
  });

  // ---------- insertFileActivity ----------

  describe('insertFileActivity', () => {
    it('inserts a single file activity record', () => {
      insertFileActivity({
        repo_id: repoId,
        path: 'src/index.ts',
        module: 'core',
        date: '2025-06-01',
        changes: 10,
      });

      const rows = getTestDb()
        .prepare('SELECT * FROM file_activity WHERE repo_id = ?')
        .all(repoId) as Record<string, unknown>[];
      expect(rows).toHaveLength(1);
      expect(rows[0].path).toBe('src/index.ts');
      expect(rows[0].module).toBe('core');
      expect(rows[0].changes).toBe(10);
    });

    it('defaults changes to 0 and path/module to null when omitted', () => {
      insertFileActivity({
        repo_id: repoId,
        date: '2025-06-01',
      });

      const rows = getTestDb()
        .prepare('SELECT * FROM file_activity WHERE repo_id = ?')
        .all(repoId) as Record<string, unknown>[];
      expect(rows).toHaveLength(1);
      expect(rows[0].path).toBeNull();
      expect(rows[0].module).toBeNull();
      expect(rows[0].changes).toBe(0);
    });
  });

  // ---------- insertFileActivityBatch ----------

  describe('insertFileActivityBatch', () => {
    it('inserts multiple records in one call', () => {
      const records: FileActivityInsert[] = [
        { repo_id: repoId, path: 'a.ts', module: 'alpha', date: '2025-06-01', changes: 5 },
        { repo_id: repoId, path: 'b.ts', module: 'beta', date: '2025-06-01', changes: 15 },
        { repo_id: repoId, path: 'c.ts', module: 'alpha', date: '2025-06-01', changes: 10 },
      ];

      insertFileActivityBatch(records);

      const rows = getTestDb()
        .prepare('SELECT * FROM file_activity WHERE repo_id = ?')
        .all(repoId);
      expect(rows).toHaveLength(3);
    });

    it('handles empty array without error', () => {
      expect(() => insertFileActivityBatch([])).not.toThrow();
    });
  });

  // ---------- getModuleActivity ----------

  describe('getModuleActivity', () => {
    it('returns empty array when no activity exists', () => {
      expect(getModuleActivity(repoId)).toEqual([]);
    });

    it('aggregates changes by module with correct percentages', () => {
      insertFileActivity({ repo_id: repoId, path: 'a.ts', module: 'core', date: '2025-06-01', changes: 60 });
      insertFileActivity({ repo_id: repoId, path: 'b.ts', module: 'core', date: '2025-06-01', changes: 40 });
      insertFileActivity({ repo_id: repoId, path: 'c.ts', module: 'ui', date: '2025-06-01', changes: 100 });

      const result = getModuleActivity(repoId);
      expect(result).toHaveLength(2);

      // Ordered by changes DESC: core=100, ui=100 (or ui first if tied -- same value)
      // Total = 200; core=100 => 50%, ui=100 => 50%
      const coreRow = result.find((r) => r.module === 'core')!;
      const uiRow = result.find((r) => r.module === 'ui')!;
      expect(coreRow.changes).toBe(100);
      expect(coreRow.percentage).toBe(50);
      expect(uiRow.changes).toBe(100);
      expect(uiRow.percentage).toBe(50);
    });

    it('excludes rows where module is null', () => {
      insertFileActivity({ repo_id: repoId, path: 'x.ts', module: null, date: '2025-06-01', changes: 50 });
      insertFileActivity({ repo_id: repoId, path: 'y.ts', module: 'api', date: '2025-06-01', changes: 50 });

      const result = getModuleActivity(repoId);
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe('api');
    });

    it('does not mix repos', () => {
      const otherRepo = seedRepo('/other', 'other');
      insertFileActivity({ repo_id: repoId, path: 'a.ts', module: 'mine', date: '2025-06-01', changes: 10 });
      insertFileActivity({ repo_id: otherRepo, path: 'b.ts', module: 'theirs', date: '2025-06-01', changes: 20 });

      const result = getModuleActivity(repoId);
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe('mine');
    });

    it('rounds percentage to two decimal places', () => {
      insertFileActivity({ repo_id: repoId, module: 'a', date: '2025-06-01', changes: 1 });
      insertFileActivity({ repo_id: repoId, module: 'b', date: '2025-06-01', changes: 2 });
      // a = 1/3 = 33.33%, b = 2/3 = 66.67%
      const result = getModuleActivity(repoId);
      const a = result.find((r) => r.module === 'a')!;
      const b = result.find((r) => r.module === 'b')!;
      expect(a.percentage).toBe(33.33);
      expect(b.percentage).toBe(66.67);
    });
  });

  // ---------- getModuleActivityByDate ----------

  describe('getModuleActivityByDate', () => {
    beforeEach(() => {
      insertFileActivity({ repo_id: repoId, module: 'core', date: '2025-06-01', changes: 30 });
      insertFileActivity({ repo_id: repoId, module: 'ui', date: '2025-06-01', changes: 70 });
      insertFileActivity({ repo_id: repoId, module: 'core', date: '2025-06-02', changes: 50 });
    });

    it('only returns activity for the given date', () => {
      const result = getModuleActivityByDate(repoId, '2025-06-01');
      expect(result).toHaveLength(2);
      const total = result.reduce((s, r) => s + r.changes, 0);
      expect(total).toBe(100);
    });

    it('returns empty for a date with no activity', () => {
      expect(getModuleActivityByDate(repoId, '2099-01-01')).toEqual([]);
    });

    it('computes percentages relative to that date only', () => {
      const result = getModuleActivityByDate(repoId, '2025-06-01');
      const core = result.find((r) => r.module === 'core')!;
      const ui = result.find((r) => r.module === 'ui')!;
      expect(core.percentage).toBe(30);
      expect(ui.percentage).toBe(70);
    });
  });

  // ---------- getTopModules ----------

  describe('getTopModules', () => {
    beforeEach(() => {
      insertFileActivity({ repo_id: repoId, module: 'api', date: '2025-06-01', changes: 10 });
      insertFileActivity({ repo_id: repoId, module: 'core', date: '2025-06-01', changes: 50 });
      insertFileActivity({ repo_id: repoId, module: 'ui', date: '2025-06-01', changes: 30 });
      insertFileActivity({ repo_id: repoId, module: 'docs', date: '2025-06-01', changes: 5 });
    });

    it('respects the limit', () => {
      const result = getTopModules(repoId, 2);
      expect(result).toHaveLength(2);
    });

    it('returns modules ordered by changes descending', () => {
      const result = getTopModules(repoId, 4);
      expect(result[0].module).toBe('core');
      expect(result[1].module).toBe('ui');
      expect(result[2].module).toBe('api');
      expect(result[3].module).toBe('docs');
    });

    it('returns all when limit exceeds the number of modules', () => {
      const result = getTopModules(repoId, 100);
      expect(result).toHaveLength(4);
    });

    it('computes percentages based on the returned subset', () => {
      // getTopModules computes percentages over the returned rows, not the full set.
      // Total of top 2: core=50 + ui=30 = 80.
      const result = getTopModules(repoId, 2);
      const core = result.find((r) => r.module === 'core')!;
      const ui = result.find((r) => r.module === 'ui')!;
      expect(core.percentage).toBe(62.5);  // 50/80 * 100
      expect(ui.percentage).toBe(37.5);    // 30/80 * 100
    });

    it('returns empty array when no modules exist', () => {
      const emptyRepo = seedRepo('/empty', 'empty');
      expect(getTopModules(emptyRepo, 5)).toEqual([]);
    });
  });
});
