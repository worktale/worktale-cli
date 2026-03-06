import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

import {
  upsertDailySummary,
  getDailySummary,
  getDailySummariesRange,
  getAllDailySummaries,
  updateUserNotes,
  updateAiDraft,
  markPublished,
  getTodaySummary,
} from '../../src/db/daily-summaries.js';

// Helper: seed a repo row and return its id.
function seedRepo(path = '/repo', name = 'repo'): number {
  const db = getTestDb();
  const result = db
    .prepare("INSERT INTO repos (path, name, first_seen, last_synced) VALUES (?, ?, datetime('now'), datetime('now'))")
    .run(path, name);
  return Number(result.lastInsertRowid);
}

describe('daily-summaries', () => {
  let repoId: number;

  beforeEach(() => {
    setupTestDb();
    repoId = seedRepo();
  });

  afterEach(() => {
    teardownTestDb();
  });

  // ---------- upsertDailySummary ----------

  describe('upsertDailySummary', () => {
    it('inserts a new daily summary', () => {
      upsertDailySummary({
        repo_id: repoId,
        date: '2025-06-01',
        commits_count: 5,
        lines_added: 100,
        lines_removed: 20,
        files_touched: 8,
      });

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row).toBeDefined();
      expect(row!.commits_count).toBe(5);
      expect(row!.lines_added).toBe(100);
      expect(row!.lines_removed).toBe(20);
      expect(row!.files_touched).toBe(8);
    });

    it('defaults numeric fields to 0 when omitted', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01' });

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row).toBeDefined();
      expect(row!.commits_count).toBe(0);
      expect(row!.lines_added).toBe(0);
      expect(row!.lines_removed).toBe(0);
      expect(row!.files_touched).toBe(0);
    });

    it('updates numeric fields on conflict', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 1 });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 10 });

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.commits_count).toBe(10);
    });

    it('preserves existing user_notes when upserting with null', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', user_notes: 'keep me' });
      // Second upsert does not supply user_notes (defaults to null).
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 2 });

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.user_notes).toBe('keep me');
    });

    it('preserves existing ai_draft when upserting with null', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', ai_draft: 'AI text' });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 3 });

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.ai_draft).toBe('AI text');
    });

    it('overwrites user_notes when a non-null value is provided', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', user_notes: 'old' });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', user_notes: 'new' });

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.user_notes).toBe('new');
    });
  });

  // ---------- getDailySummary ----------

  describe('getDailySummary', () => {
    it('returns the summary for an existing (repo, date)', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 7 });
      const row = getDailySummary(repoId, '2025-06-01');
      expect(row).toBeDefined();
      expect(row!.commits_count).toBe(7);
    });

    it('returns undefined when nothing exists', () => {
      expect(getDailySummary(repoId, '2099-01-01')).toBeUndefined();
    });

    it('is scoped to the repo', () => {
      const otherRepo = seedRepo('/other', 'other');
      upsertDailySummary({ repo_id: otherRepo, date: '2025-06-01', commits_count: 1 });
      expect(getDailySummary(repoId, '2025-06-01')).toBeUndefined();
    });
  });

  // ---------- getDailySummariesRange ----------

  describe('getDailySummariesRange', () => {
    beforeEach(() => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01' });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-02' });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-03' });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-04' });
    });

    it('returns summaries within the inclusive date range', () => {
      const rows = getDailySummariesRange(repoId, '2025-06-02', '2025-06-03');
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.date)).toEqual(['2025-06-02', '2025-06-03']);
    });

    it('returns empty when range has no data', () => {
      expect(getDailySummariesRange(repoId, '2025-07-01', '2025-07-31')).toEqual([]);
    });

    it('orders by date ascending', () => {
      const rows = getDailySummariesRange(repoId, '2025-06-01', '2025-06-04');
      expect(rows[0].date).toBe('2025-06-01');
      expect(rows[3].date).toBe('2025-06-04');
    });
  });

  // ---------- getAllDailySummaries ----------

  describe('getAllDailySummaries', () => {
    it('returns empty array when none exist', () => {
      expect(getAllDailySummaries(repoId)).toEqual([]);
    });

    it('returns all summaries for the repo ordered by date', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-03' });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01' });
      upsertDailySummary({ repo_id: repoId, date: '2025-06-02' });

      const rows = getAllDailySummaries(repoId);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.date)).toEqual(['2025-06-01', '2025-06-02', '2025-06-03']);
    });

    it('does not include summaries from other repos', () => {
      const other = seedRepo('/other', 'other');
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01' });
      upsertDailySummary({ repo_id: other, date: '2025-06-01' });

      expect(getAllDailySummaries(repoId)).toHaveLength(1);
    });
  });

  // ---------- updateUserNotes ----------

  describe('updateUserNotes', () => {
    it('updates the user_notes column', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01' });
      updateUserNotes(repoId, '2025-06-01', 'My notes');

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.user_notes).toBe('My notes');
    });

    it('overwrites previous user_notes', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', user_notes: 'old' });
      updateUserNotes(repoId, '2025-06-01', 'new');

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.user_notes).toBe('new');
    });

    it('does nothing for a non-existent (repo, date)', () => {
      // Should not throw, just a no-op UPDATE
      expect(() => updateUserNotes(repoId, '2099-01-01', 'no row')).not.toThrow();
    });
  });

  // ---------- updateAiDraft ----------

  describe('updateAiDraft', () => {
    it('updates the ai_draft column', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01' });
      updateAiDraft(repoId, '2025-06-01', 'AI generated text');

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.ai_draft).toBe('AI generated text');
    });

    it('overwrites previous ai_draft', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01', ai_draft: 'v1' });
      updateAiDraft(repoId, '2025-06-01', 'v2');

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.ai_draft).toBe('v2');
    });
  });

  // ---------- markPublished ----------

  describe('markPublished', () => {
    it('sets published to 1 and records published_at', () => {
      upsertDailySummary({ repo_id: repoId, date: '2025-06-01' });
      markPublished(repoId, '2025-06-01');

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.published).toBe(1);
      expect(row!.published_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('does not alter other fields', () => {
      upsertDailySummary({
        repo_id: repoId,
        date: '2025-06-01',
        commits_count: 3,
        user_notes: 'keep',
      });
      markPublished(repoId, '2025-06-01');

      const row = getDailySummary(repoId, '2025-06-01');
      expect(row!.commits_count).toBe(3);
      expect(row!.user_notes).toBe('keep');
    });
  });

  // ---------- getTodaySummary ----------

  describe('getTodaySummary', () => {
    it('returns the summary for today if one exists', () => {
      const today = new Date().toISOString().slice(0, 10);
      upsertDailySummary({ repo_id: repoId, date: today, commits_count: 42 });

      const row = getTodaySummary(repoId);
      expect(row).toBeDefined();
      expect(row!.commits_count).toBe(42);
    });

    it('returns undefined when no summary exists for today', () => {
      expect(getTodaySummary(repoId)).toBeUndefined();
    });
  });
});
