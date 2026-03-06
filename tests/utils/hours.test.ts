import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

import {
  getWorkingHourDistribution,
  getEstimatedCodingTime,
} from '../../src/utils/streaks.js';
import type { HourDistribution } from '../../src/utils/streaks.js';

// Helper: seed a repo and return its id.
function seedRepo(path = '/repo', name = 'repo'): number {
  const db = getTestDb();
  const result = db
    .prepare("INSERT INTO repos (path, name, first_seen, last_synced) VALUES (?, ?, datetime('now'), datetime('now'))")
    .run(path, name);
  return Number(result.lastInsertRowid);
}

// Helper: insert a commit at a specific timestamp.
function insertCommit(repoId: number, sha: string, timestamp: string): void {
  const db = getTestDb();
  db.prepare(
    'INSERT INTO commits (repo_id, sha, timestamp) VALUES (?, ?, ?)'
  ).run(repoId, sha, timestamp);
}

describe('getWorkingHourDistribution', () => {
  let repoId: number;

  beforeEach(() => {
    setupTestDb();
    repoId = seedRepo();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it('returns 24 hours even when there are no commits', () => {
    const result = getWorkingHourDistribution(repoId);

    expect(result).toHaveLength(24);
    for (let h = 0; h < 24; h++) {
      expect(result[h]).toEqual({ hour: h, commits: 0 });
    }
  });

  it('returns correct counts for hours with commits', () => {
    // 3 commits at hour 9, 2 at hour 14, 1 at hour 22
    insertCommit(repoId, 'a1', '2026-03-06T09:10:00Z');
    insertCommit(repoId, 'a2', '2026-03-06T09:30:00Z');
    insertCommit(repoId, 'a3', '2026-03-05T09:45:00Z');
    insertCommit(repoId, 'b1', '2026-03-06T14:00:00Z');
    insertCommit(repoId, 'b2', '2026-03-06T14:30:00Z');
    insertCommit(repoId, 'c1', '2026-03-06T22:15:00Z');

    const result = getWorkingHourDistribution(repoId);

    expect(result).toHaveLength(24);
    expect(result[9].commits).toBe(3);
    expect(result[14].commits).toBe(2);
    expect(result[22].commits).toBe(1);
    // All other hours should be 0
    expect(result[0].commits).toBe(0);
    expect(result[12].commits).toBe(0);
    expect(result[23].commits).toBe(0);
  });

  it('does not count commits from other repos', () => {
    const otherRepoId = seedRepo('/other', 'other');
    insertCommit(repoId, 'mine', '2026-03-06T10:00:00Z');
    insertCommit(otherRepoId, 'theirs', '2026-03-06T10:30:00Z');

    const result = getWorkingHourDistribution(repoId);
    expect(result[10].commits).toBe(1);
  });

  it('hours are ordered 0-23', () => {
    const result = getWorkingHourDistribution(repoId);
    for (let h = 0; h < 24; h++) {
      expect(result[h].hour).toBe(h);
    }
  });
});

describe('getEstimatedCodingTime', () => {
  let repoId: number;

  beforeEach(() => {
    setupTestDb();
    repoId = seedRepo();
  });

  afterEach(() => {
    teardownTestDb();
  });

  it('returns 0 when there are no commits on the date', () => {
    const result = getEstimatedCodingTime(repoId, '2026-03-06');
    expect(result).toBe(0);
  });

  it('returns 0 when there is only one commit', () => {
    insertCommit(repoId, 'solo', '2026-03-06T10:00:00Z');

    const result = getEstimatedCodingTime(repoId, '2026-03-06');
    expect(result).toBe(0);
  });

  it('returns correct minutes between first and last commit', () => {
    // 10:00 to 12:30 = 150 minutes
    insertCommit(repoId, 'first', '2026-03-06T10:00:00Z');
    insertCommit(repoId, 'middle', '2026-03-06T11:15:00Z');
    insertCommit(repoId, 'last', '2026-03-06T12:30:00Z');

    const result = getEstimatedCodingTime(repoId, '2026-03-06');
    expect(result).toBe(150);
  });

  it('only considers commits on the given date', () => {
    insertCommit(repoId, 'yesterday', '2026-03-05T23:00:00Z');
    insertCommit(repoId, 'today1', '2026-03-06T09:00:00Z');
    insertCommit(repoId, 'today2', '2026-03-06T10:00:00Z');
    insertCommit(repoId, 'tomorrow', '2026-03-07T01:00:00Z');

    const result = getEstimatedCodingTime(repoId, '2026-03-06');
    expect(result).toBe(60); // 9:00 to 10:00 = 60 minutes
  });

  it('does not count commits from other repos', () => {
    const otherRepoId = seedRepo('/other', 'other');
    insertCommit(repoId, 'mine1', '2026-03-06T09:00:00Z');
    insertCommit(repoId, 'mine2', '2026-03-06T09:30:00Z');
    insertCommit(otherRepoId, 'theirs', '2026-03-06T12:00:00Z');

    const result = getEstimatedCodingTime(repoId, '2026-03-06');
    expect(result).toBe(30); // Only my commits: 9:00 to 9:30
  });

  it('handles two commits at the same time', () => {
    insertCommit(repoId, 'c1', '2026-03-06T10:00:00Z');
    insertCommit(repoId, 'c2', '2026-03-06T10:00:00Z');

    const result = getEstimatedCodingTime(repoId, '2026-03-06');
    expect(result).toBe(0);
  });
});
