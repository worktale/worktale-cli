import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

// Mock cloud-client — control isCloudConfigured per test
let mockCloudConfigured = false;
vi.mock('../../src/utils/cloud-client.js', () => ({
  isCloudConfigured: () => mockCloudConfigured,
}));

import { showCatchupBanner } from '../../src/utils/catchup-banner.js';
import { upsertDailySummary, markPublished } from '../../src/db/daily-summaries.js';

function seedRepo(path = '/repo', name = 'repo'): number {
  const db = getTestDb();
  const result = db
    .prepare("INSERT INTO repos (path, name, first_seen, last_synced) VALUES (?, ?, datetime('now'), datetime('now'))")
    .run(path, name);
  return Number(result.lastInsertRowid);
}

describe('showCatchupBanner', () => {
  let output: string[] = [];
  const originalLog = console.log;
  let repoId: number;

  beforeEach(() => {
    setupTestDb();
    repoId = seedRepo();
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    mockCloudConfigured = false;
  });

  afterEach(() => {
    console.log = originalLog;
    teardownTestDb();
  });

  it('does nothing when cloud is not configured', () => {
    mockCloudConfigured = false;
    upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 3 });

    showCatchupBanner();

    expect(output).toHaveLength(0);
  });

  it('does nothing when there are no unpublished days', () => {
    mockCloudConfigured = true;

    showCatchupBanner();

    expect(output).toHaveLength(0);
  });

  it('does nothing when all days are published', () => {
    mockCloudConfigured = true;
    upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 3 });
    markPublished(repoId, '2025-06-01');

    showCatchupBanner();

    expect(output).toHaveLength(0);
  });

  it('shows banner with count when unpublished days exist', () => {
    mockCloudConfigured = true;
    upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 3 });
    upsertDailySummary({ repo_id: repoId, date: '2025-06-02', commits_count: 5 });

    showCatchupBanner();

    const joined = output.join('\n');
    expect(joined).toContain('2');
    expect(joined).toContain('unpublished days');
    expect(joined).toContain('worktale publish');
  });

  it('uses singular "day" for 1 unpublished day', () => {
    mockCloudConfigured = true;
    upsertDailySummary({ repo_id: repoId, date: '2025-06-01', commits_count: 3 });

    showCatchupBanner();

    const joined = output.join('\n');
    expect(joined).toContain('1');
    expect(joined).toContain('unpublished day.');
    expect(joined).not.toContain('unpublished days.');
  });

  it('does not count today as unpublished', () => {
    mockCloudConfigured = true;
    const today = new Date().toISOString().slice(0, 10);
    upsertDailySummary({ repo_id: repoId, date: today, commits_count: 10 });

    showCatchupBanner();

    expect(output).toHaveLength(0);
  });
});
