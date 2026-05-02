import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

import {
  getCommitsByDateAcrossRepos,
  getCommitsByDateRangeAcrossRepos,
  getRecentCommitsAcrossRepos,
  getAggregatedDailySummary,
  getPerRepoDailySummary,
  getPerRepoDailySummaryRange,
  getCombinedTopModules,
  getCombinedAiSessionStats,
  getDailyAiSummaryAcrossRepos,
  getGlobalHeatmap,
  getGlobalFirstCommitDate,
  getGlobalLastCommitDate,
  getActiveDatesGlobal,
  getAllTimeStats,
} from '../../src/db/aggregates.js';
import { getStreakInfoGlobal } from '../../src/utils/streaks.js';

function seedRepo(path: string, name: string): number {
  const db = getTestDb();
  const result = db
    .prepare("INSERT INTO repos (path, name, first_seen, last_synced) VALUES (?, ?, datetime('now'), datetime('now'))")
    .run(path, name);
  return Number(result.lastInsertRowid);
}

function seedCommit(repoId: number, sha: string, timestamp: string, opts: { added?: number; removed?: number; files?: number; message?: string } = {}): void {
  getTestDb().prepare(`
    INSERT INTO commits (repo_id, sha, message, author, timestamp, lines_added, lines_removed, files_changed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(repoId, sha, opts.message ?? null, null, timestamp, opts.added ?? 0, opts.removed ?? 0, opts.files ?? 0);
}

function seedSummary(repoId: number, date: string, opts: { commits?: number; added?: number; removed?: number; files?: number } = {}): void {
  getTestDb().prepare(`
    INSERT INTO daily_summaries (repo_id, date, commits_count, lines_added, lines_removed, files_touched)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(repoId, date, opts.commits ?? 0, opts.added ?? 0, opts.removed ?? 0, opts.files ?? 0);
}

function seedFileActivity(repoId: number, mod: string, date: string, changes: number): void {
  getTestDb().prepare(`
    INSERT INTO file_activity (repo_id, path, module, date, changes)
    VALUES (?, ?, ?, ?, ?)
  `).run(repoId, `${mod}/file.ts`, mod, date, changes);
}

function seedAiSession(repoId: number, date: string, opts: { cost?: number; input?: number; output?: number; provider?: string; model?: string; tool?: string; toolsUsed?: string[]; mcp?: string[] } = {}): void {
  getTestDb().prepare(`
    INSERT INTO ai_sessions (repo_id, date, provider, model, tool, cost_usd, input_tokens, output_tokens, tools_used, mcp_servers, duration_secs, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    repoId,
    date,
    opts.provider ?? 'anthropic',
    opts.model ?? 'claude-opus',
    opts.tool ?? 'claude-code',
    opts.cost ?? 0,
    opts.input ?? 0,
    opts.output ?? 0,
    opts.toolsUsed ? JSON.stringify(opts.toolsUsed) : null,
    opts.mcp ? JSON.stringify(opts.mcp) : null,
    0,
    `${date}T12:00:00Z`,
  );
}

describe('aggregates (cross-repo)', () => {
  let repoA: number;
  let repoB: number;

  beforeEach(() => {
    setupTestDb();
    repoA = seedRepo('/a', 'repo-a');
    repoB = seedRepo('/b', 'repo-b');
  });

  afterEach(() => {
    teardownTestDb();
  });

  describe('getCommitsByDateAcrossRepos', () => {
    it('returns commits from all repos for the given date with repo_name and repo_path', () => {
      seedCommit(repoA, 'a1', '2025-06-01T09:00:00');
      seedCommit(repoB, 'b1', '2025-06-01T10:00:00');
      seedCommit(repoA, 'a2', '2025-06-02T09:00:00');

      const rows = getCommitsByDateAcrossRepos('2025-06-01');
      expect(rows).toHaveLength(2);
      const names = rows.map((r) => r.repo_name).sort();
      expect(names).toEqual(['repo-a', 'repo-b']);
      expect(rows[0]).toHaveProperty('repo_path');
    });

    it('returns empty when no commits match', () => {
      expect(getCommitsByDateAcrossRepos('2099-01-01')).toEqual([]);
    });

    it('orders by timestamp ascending', () => {
      seedCommit(repoA, 'late', '2025-06-01T20:00:00');
      seedCommit(repoB, 'early', '2025-06-01T08:00:00');

      const rows = getCommitsByDateAcrossRepos('2025-06-01');
      expect(rows[0].sha).toBe('early');
      expect(rows[1].sha).toBe('late');
    });
  });

  describe('getCommitsByDateRangeAcrossRepos', () => {
    it('returns commits from all repos within the inclusive range', () => {
      seedCommit(repoA, 'a1', '2025-06-01T10:00:00');
      seedCommit(repoB, 'b1', '2025-06-02T10:00:00');
      seedCommit(repoA, 'a2', '2025-06-03T10:00:00');
      seedCommit(repoA, 'a3', '2025-06-04T10:00:00');

      const rows = getCommitsByDateRangeAcrossRepos('2025-06-02', '2025-06-03');
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.sha)).toEqual(['b1', 'a2']);
    });
  });

  describe('getRecentCommitsAcrossRepos', () => {
    it('returns most recent commits across all repos with repo names', () => {
      seedCommit(repoA, 'old', '2025-06-01T00:00:00');
      seedCommit(repoB, 'mid', '2025-06-02T00:00:00');
      seedCommit(repoA, 'new', '2025-06-03T00:00:00');

      const rows = getRecentCommitsAcrossRepos(2);
      expect(rows).toHaveLength(2);
      expect(rows[0].sha).toBe('new');
      expect(rows[0].repo_name).toBe('repo-a');
      expect(rows[1].sha).toBe('mid');
      expect(rows[1].repo_name).toBe('repo-b');
    });
  });

  describe('getAggregatedDailySummary', () => {
    it('sums across repos for one date', () => {
      seedSummary(repoA, '2025-06-01', { commits: 3, added: 100, removed: 20, files: 5 });
      seedSummary(repoB, '2025-06-01', { commits: 4, added: 200, removed: 50, files: 10 });

      const agg = getAggregatedDailySummary('2025-06-01');
      expect(agg.commits_count).toBe(7);
      expect(agg.lines_added).toBe(300);
      expect(agg.lines_removed).toBe(70);
      expect(agg.files_touched).toBe(15);
      expect(agg.repo_count).toBe(2);
    });

    it('returns zeros and 0 repo_count when no rows exist', () => {
      const agg = getAggregatedDailySummary('2099-01-01');
      expect(agg.commits_count).toBe(0);
      expect(agg.repo_count).toBe(0);
    });

    it('does not count repos with zero commits in repo_count', () => {
      seedSummary(repoA, '2025-06-01', { commits: 5 });
      seedSummary(repoB, '2025-06-01', { commits: 0 });

      const agg = getAggregatedDailySummary('2025-06-01');
      expect(agg.repo_count).toBe(1);
    });
  });

  describe('getPerRepoDailySummary', () => {
    it('returns one row per active repo for the date, joined with repo info', () => {
      seedSummary(repoA, '2025-06-01', { commits: 3 });
      seedSummary(repoB, '2025-06-01', { commits: 5 });

      const rows = getPerRepoDailySummary('2025-06-01');
      expect(rows).toHaveLength(2);
      expect(rows[0].commits_count).toBe(5); // ordered by commits_count DESC
      expect(rows[0].repo_name).toBe('repo-b');
      expect(rows[1].repo_name).toBe('repo-a');
    });

    it('excludes repos with zero commits on that date', () => {
      seedSummary(repoA, '2025-06-01', { commits: 3 });
      seedSummary(repoB, '2025-06-01', { commits: 0 });

      const rows = getPerRepoDailySummary('2025-06-01');
      expect(rows).toHaveLength(1);
      expect(rows[0].repo_name).toBe('repo-a');
    });
  });

  describe('getPerRepoDailySummaryRange', () => {
    it('returns rows within range across repos', () => {
      seedSummary(repoA, '2025-06-01', { commits: 1 });
      seedSummary(repoB, '2025-06-02', { commits: 1 });
      seedSummary(repoA, '2025-06-05', { commits: 1 });

      const rows = getPerRepoDailySummaryRange('2025-06-01', '2025-06-03');
      expect(rows).toHaveLength(2);
    });
  });

  describe('getCombinedTopModules', () => {
    it('groups by (repo_id, module) and returns top N with repo_name', () => {
      seedFileActivity(repoA, 'src/db', '2025-06-01', 50);
      seedFileActivity(repoA, 'src/db', '2025-06-02', 30);
      seedFileActivity(repoB, 'src/api', '2025-06-01', 40);
      seedFileActivity(repoB, 'src/util', '2025-06-01', 10);

      const rows = getCombinedTopModules(10);
      expect(rows).toHaveLength(3); // (repoA,src/db), (repoB,src/api), (repoB,src/util)
      expect(rows[0].repo_name).toBe('repo-a');
      expect(rows[0].module).toBe('src/db');
      expect(rows[0].changes).toBe(80);
      expect(rows[0].percentage).toBeGreaterThan(0);
    });

    it('limits to N rows', () => {
      seedFileActivity(repoA, 'm1', '2025-06-01', 10);
      seedFileActivity(repoA, 'm2', '2025-06-01', 20);
      seedFileActivity(repoB, 'm3', '2025-06-01', 30);

      expect(getCombinedTopModules(2)).toHaveLength(2);
    });

    it('respects optional days window', () => {
      const today = new Date().toISOString().slice(0, 10);
      const longAgo = '2020-01-01';
      seedFileActivity(repoA, 'recent', today, 50);
      seedFileActivity(repoA, 'ancient', longAgo, 1000);

      const rows = getCombinedTopModules(10, 30);
      expect(rows.find((r) => r.module === 'ancient')).toBeUndefined();
      expect(rows.find((r) => r.module === 'recent')).toBeDefined();
    });

    it('skips file_activity rows with null module', () => {
      getTestDb().prepare(`
        INSERT INTO file_activity (repo_id, path, module, date, changes)
        VALUES (?, ?, NULL, ?, ?)
      `).run(repoA, 'x.ts', '2025-06-01', 99);
      seedFileActivity(repoA, 'real', '2025-06-01', 10);

      const rows = getCombinedTopModules(10);
      expect(rows).toHaveLength(1);
      expect(rows[0].module).toBe('real');
    });
  });

  describe('getCombinedAiSessionStats', () => {
    it('aggregates across repos and groups per_repo', () => {
      const today = new Date().toISOString().slice(0, 10);
      seedAiSession(repoA, today, { cost: 1.0, input: 100, output: 50 });
      seedAiSession(repoA, today, { cost: 0.5, input: 200, output: 100, tool: 'codex' });
      seedAiSession(repoB, today, { cost: 2.0, input: 500, output: 300 });

      const stats = getCombinedAiSessionStats(30);
      expect(stats.total_sessions).toBe(3);
      expect(stats.total_cost).toBeCloseTo(3.5, 5);
      expect(stats.total_input_tokens).toBe(800);
      expect(stats.total_output_tokens).toBe(450);
      expect(stats.tools['claude-code']).toBe(2);
      expect(stats.tools['codex']).toBe(1);

      expect(stats.per_repo).toHaveLength(2);
      // Sorted by cost DESC
      expect(stats.per_repo[0].repo_name).toBe('repo-b');
      expect(stats.per_repo[0].cost).toBeCloseTo(2.0, 5);
      expect(stats.per_repo[1].repo_name).toBe('repo-a');
      expect(stats.per_repo[1].sessions).toBe(2);
    });

    it('parses tools_used and mcp_servers JSON', () => {
      const today = new Date().toISOString().slice(0, 10);
      seedAiSession(repoA, today, { toolsUsed: ['Read', 'Edit'], mcp: ['code-review-graph'] });
      seedAiSession(repoB, today, { toolsUsed: ['Read'], mcp: ['code-review-graph', 'qmd'] });

      const stats = getCombinedAiSessionStats(30);
      expect(stats.tools_used_frequency['Read']).toBe(2);
      expect(stats.tools_used_frequency['Edit']).toBe(1);
      expect(stats.mcp_servers_used['code-review-graph']).toBe(2);
      expect(stats.mcp_servers_used['qmd']).toBe(1);
    });

    it('respects the days window', () => {
      const today = new Date().toISOString().slice(0, 10);
      seedAiSession(repoA, today);
      seedAiSession(repoA, '2020-01-01');

      const stats = getCombinedAiSessionStats(30);
      expect(stats.total_sessions).toBe(1);
    });

    it('returns empty/zero state when no sessions', () => {
      const stats = getCombinedAiSessionStats(30);
      expect(stats.total_sessions).toBe(0);
      expect(stats.per_repo).toEqual([]);
    });
  });

  describe('getDailyAiSummaryAcrossRepos', () => {
    it('groups by date summing cost and tokens across repos', () => {
      seedAiSession(repoA, '2025-06-01', { cost: 1.0, input: 100, output: 50 });
      seedAiSession(repoB, '2025-06-01', { cost: 0.5, input: 200, output: 100 });
      seedAiSession(repoA, '2025-06-02', { cost: 0.25, input: 50, output: 25 });

      const rows = getDailyAiSummaryAcrossRepos('2025-06-01', '2025-06-02');
      expect(rows).toHaveLength(2);
      const day1 = rows.find((r) => r.date === '2025-06-01')!;
      expect(day1.sessions).toBe(2);
      expect(day1.cost).toBeCloseTo(1.5, 5);
      expect(day1.tokens).toBe(450);
    });
  });

  describe('getGlobalHeatmap', () => {
    it('returns date->commit-count map summed across repos', () => {
      seedSummary(repoA, '2025-06-01', { commits: 3 });
      seedSummary(repoB, '2025-06-01', { commits: 5 });
      seedSummary(repoA, '2025-06-02', { commits: 2 });

      const recent = '2025-06-01';
      const since = new Date(recent);
      since.setDate(since.getDate() - 1);

      // Just call with a wide window to capture both dates from any "today"
      const map = getGlobalHeatmap(10_000);
      expect(map.get('2025-06-01')).toBe(8);
      expect(map.get('2025-06-02')).toBe(2);
    });

    it('excludes dates with zero commits', () => {
      seedSummary(repoA, '2025-06-01', { commits: 0 });
      const map = getGlobalHeatmap(10_000);
      expect(map.has('2025-06-01')).toBe(false);
    });
  });

  describe('getGlobalFirstCommitDate / getGlobalLastCommitDate', () => {
    it('returns null when no commits', () => {
      expect(getGlobalFirstCommitDate()).toBeNull();
      expect(getGlobalLastCommitDate()).toBeNull();
    });

    it('returns earliest and latest commit dates across all repos', () => {
      seedCommit(repoA, 'mid', '2025-06-15T10:00:00');
      seedCommit(repoB, 'early', '2025-01-01T10:00:00');
      seedCommit(repoA, 'late', '2025-12-31T10:00:00');

      expect(getGlobalFirstCommitDate()).toBe('2025-01-01');
      expect(getGlobalLastCommitDate()).toBe('2025-12-31');
    });
  });

  describe('getActiveDatesGlobal', () => {
    it('returns distinct active dates in ascending order', () => {
      seedCommit(repoA, 'a', '2025-06-02T10:00:00');
      seedCommit(repoA, 'b', '2025-06-02T11:00:00'); // same date
      seedCommit(repoB, 'c', '2025-06-01T09:00:00');

      const dates = getActiveDatesGlobal();
      expect(dates).toEqual(['2025-06-01', '2025-06-02']);
    });
  });

  describe('getStreakInfoGlobal', () => {
    it('returns 0 when no commits exist', () => {
      const info = getStreakInfoGlobal();
      expect(info.current).toBe(0);
      expect(info.best).toBe(0);
    });

    it('treats any-repo-active as a streak day across repos', () => {
      // calculate-current-streak only counts streak ending today/yesterday;
      // we use calculateBestStreak instead by checking best streak
      seedCommit(repoA, 'a1', '2025-06-01T10:00:00');
      seedCommit(repoB, 'b1', '2025-06-02T10:00:00');
      seedCommit(repoA, 'a2', '2025-06-03T10:00:00');

      const info = getStreakInfoGlobal();
      expect(info.best).toBe(3);
      expect(info.bestStart).toBe('2025-06-01');
      expect(info.bestEnd).toBe('2025-06-03');
    });

    it('deduplicates the same date across repos', () => {
      seedCommit(repoA, 'a', '2025-06-01T10:00:00');
      seedCommit(repoB, 'b', '2025-06-01T11:00:00');

      const info = getStreakInfoGlobal();
      expect(info.best).toBe(1);
    });
  });

  describe('getAllTimeStats', () => {
    it('aggregates totals across all repos and includes repo_count and first_commit', () => {
      seedSummary(repoA, '2025-06-01', { commits: 3, added: 100, removed: 20, files: 5 });
      seedSummary(repoB, '2025-06-02', { commits: 4, added: 200, removed: 50, files: 10 });
      seedCommit(repoA, 'firstever', '2024-01-01T08:00:00');
      seedCommit(repoB, 'latest', '2025-06-02T18:00:00');

      const stats = getAllTimeStats();
      expect(stats.total_commits).toBe(7);
      expect(stats.total_added).toBe(300);
      expect(stats.total_removed).toBe(70);
      expect(stats.total_files).toBe(15);
      expect(stats.days_active).toBe(2);
      expect(stats.repo_count).toBe(2);
      expect(stats.first_commit).toBe('2024-01-01');
      expect(stats.last_commit).toBe('2025-06-02');
    });

    it('returns zero/null state when DB is empty (still counts repos)', () => {
      const stats = getAllTimeStats();
      expect(stats.total_commits).toBe(0);
      expect(stats.repo_count).toBe(2); // we seeded two empty repos
      expect(stats.first_commit).toBeNull();
    });
  });
});
