import { getDb } from './index.js';
import type { Commit } from './commits.js';
import type { DailySummary } from './daily-summaries.js';
import type { AiSession } from './ai-sessions.js';

export interface CommitWithRepo extends Commit {
  repo_name: string;
  repo_path: string;
}

export interface DailySummaryWithRepo extends DailySummary {
  repo_name: string;
  repo_path: string;
}

export interface AggregatedDailySummary {
  date: string;
  commits_count: number;
  lines_added: number;
  lines_removed: number;
  files_touched: number;
  repo_count: number;
}

export interface RepoModuleActivity {
  repo_id: number;
  repo_name: string;
  module: string;
  changes: number;
  percentage: number;
}

export interface CombinedAiSessionStats {
  total_sessions: number;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_duration_secs: number;
  providers: Record<string, number>;
  models: Record<string, number>;
  tools: Record<string, number>;
  tools_used_frequency: Record<string, number>;
  mcp_servers_used: Record<string, number>;
  per_repo: Array<{ repo_name: string; sessions: number; cost: number; tokens: number }>;
}

export interface AllTimeStats {
  total_commits: number;
  total_added: number;
  total_removed: number;
  total_files: number;
  days_active: number;
  repo_count: number;
  first_commit: string | null;
  last_commit: string | null;
}

export function getCommitsByDateAcrossRepos(date: string): CommitWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, r.name AS repo_name, r.path AS repo_path
    FROM commits c
    JOIN repos r ON r.id = c.repo_id
    WHERE c.timestamp >= ? AND c.timestamp < ?
    ORDER BY c.timestamp ASC
  `).all(`${date}T00:00:00`, `${date}T23:59:59.999`) as CommitWithRepo[];
}

export function getCommitsByDateRangeAcrossRepos(startDate: string, endDate: string): CommitWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, r.name AS repo_name, r.path AS repo_path
    FROM commits c
    JOIN repos r ON r.id = c.repo_id
    WHERE c.timestamp >= ? AND c.timestamp < ?
    ORDER BY c.timestamp ASC
  `).all(`${startDate}T00:00:00`, `${endDate}T23:59:59.999`) as CommitWithRepo[];
}

export function getRecentCommitsAcrossRepos(limit: number): CommitWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, r.name AS repo_name, r.path AS repo_path
    FROM commits c
    JOIN repos r ON r.id = c.repo_id
    ORDER BY c.timestamp DESC
    LIMIT ?
  `).all(limit) as CommitWithRepo[];
}

export function getAggregatedDailySummary(date: string): AggregatedDailySummary {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(commits_count), 0) AS commits_count,
      COALESCE(SUM(lines_added), 0)   AS lines_added,
      COALESCE(SUM(lines_removed), 0) AS lines_removed,
      COALESCE(SUM(files_touched), 0) AS files_touched,
      COUNT(DISTINCT CASE WHEN commits_count > 0 THEN repo_id END) AS repo_count
    FROM daily_summaries
    WHERE date = ?
  `).get(date) as {
    commits_count: number;
    lines_added: number;
    lines_removed: number;
    files_touched: number;
    repo_count: number;
  };
  return { date, ...row };
}

export function getPerRepoDailySummary(date: string): DailySummaryWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT ds.*, r.name AS repo_name, r.path AS repo_path
    FROM daily_summaries ds
    JOIN repos r ON r.id = ds.repo_id
    WHERE ds.date = ? AND ds.commits_count > 0
    ORDER BY ds.commits_count DESC, r.name ASC
  `).all(date) as DailySummaryWithRepo[];
}

export function getPerRepoDailySummaryRange(startDate: string, endDate: string): DailySummaryWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT ds.*, r.name AS repo_name, r.path AS repo_path
    FROM daily_summaries ds
    JOIN repos r ON r.id = ds.repo_id
    WHERE ds.date >= ? AND ds.date <= ? AND ds.commits_count > 0
    ORDER BY ds.date ASC, r.name ASC
  `).all(startDate, endDate) as DailySummaryWithRepo[];
}

export function getCombinedTopModules(limit: number, days?: number): RepoModuleActivity[] {
  const db = getDb();

  let rows: Array<{ repo_id: number; repo_name: string; module: string; changes: number }>;
  if (typeof days === 'number' && days > 0) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);
    rows = db.prepare(`
      SELECT fa.repo_id, r.name AS repo_name, fa.module, SUM(fa.changes) AS changes
      FROM file_activity fa
      JOIN repos r ON r.id = fa.repo_id
      WHERE fa.module IS NOT NULL AND fa.date >= ?
      GROUP BY fa.repo_id, fa.module
      ORDER BY changes DESC
      LIMIT ?
    `).all(sinceStr, limit) as typeof rows;
  } else {
    rows = db.prepare(`
      SELECT fa.repo_id, r.name AS repo_name, fa.module, SUM(fa.changes) AS changes
      FROM file_activity fa
      JOIN repos r ON r.id = fa.repo_id
      WHERE fa.module IS NOT NULL
      GROUP BY fa.repo_id, fa.module
      ORDER BY changes DESC
      LIMIT ?
    `).all(limit) as typeof rows;
  }

  const total = rows.reduce((sum, r) => sum + r.changes, 0);
  return rows.map((r) => ({
    repo_id: r.repo_id,
    repo_name: r.repo_name,
    module: r.module,
    changes: r.changes,
    percentage: total > 0 ? Math.round((r.changes / total) * 10000) / 100 : 0,
  }));
}

export function getCombinedAiSessionStats(days: number = 30): CombinedAiSessionStats {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const sessions = db.prepare(`
    SELECT s.*, r.name AS repo_name
    FROM ai_sessions s
    JOIN repos r ON r.id = s.repo_id
    WHERE s.date >= ?
    ORDER BY s.timestamp DESC
  `).all(sinceStr) as Array<AiSession & { repo_name: string }>;

  const stats: CombinedAiSessionStats = {
    total_sessions: sessions.length,
    total_cost: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    total_duration_secs: 0,
    providers: {},
    models: {},
    tools: {},
    tools_used_frequency: {},
    mcp_servers_used: {},
    per_repo: [],
  };

  const perRepoMap = new Map<string, { sessions: number; cost: number; tokens: number }>();

  for (const s of sessions) {
    stats.total_cost += s.cost_usd;
    stats.total_input_tokens += s.input_tokens;
    stats.total_output_tokens += s.output_tokens;
    stats.total_cache_read_tokens += s.cache_read_tokens ?? 0;
    stats.total_cache_write_tokens += s.cache_write_tokens ?? 0;
    stats.total_duration_secs += s.duration_secs;

    if (s.provider) stats.providers[s.provider] = (stats.providers[s.provider] ?? 0) + 1;
    if (s.model) stats.models[s.model] = (stats.models[s.model] ?? 0) + 1;
    if (s.tool) stats.tools[s.tool] = (stats.tools[s.tool] ?? 0) + 1;

    if (s.tools_used) {
      try {
        const tools = JSON.parse(s.tools_used) as string[];
        for (const t of tools) {
          stats.tools_used_frequency[t] = (stats.tools_used_frequency[t] ?? 0) + 1;
        }
      } catch { /* ignore */ }
    }

    if (s.mcp_servers) {
      try {
        const servers = JSON.parse(s.mcp_servers) as string[];
        for (const srv of servers) {
          stats.mcp_servers_used[srv] = (stats.mcp_servers_used[srv] ?? 0) + 1;
        }
      } catch { /* ignore */ }
    }

    const bucket = perRepoMap.get(s.repo_name) ?? { sessions: 0, cost: 0, tokens: 0 };
    bucket.sessions += 1;
    bucket.cost += s.cost_usd;
    bucket.tokens += s.input_tokens + s.output_tokens;
    perRepoMap.set(s.repo_name, bucket);
  }

  stats.per_repo = [...perRepoMap.entries()]
    .map(([repo_name, v]) => ({ repo_name, ...v }))
    .sort((a, b) => b.cost - a.cost || b.sessions - a.sessions);

  return stats;
}

export function getDailyAiSummaryAcrossRepos(
  startDate: string,
  endDate: string,
): Array<{ date: string; sessions: number; cost: number; tokens: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT date,
           COUNT(*) AS sessions,
           COALESCE(SUM(cost_usd), 0) AS cost,
           COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
    FROM ai_sessions
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(startDate, endDate) as Array<{ date: string; sessions: number; cost: number; tokens: number }>;
}

export function getGlobalHeatmap(days: number): Map<string, number> {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT date, SUM(commits_count) AS commits
    FROM daily_summaries
    WHERE date >= ?
    GROUP BY date
  `).all(sinceStr) as Array<{ date: string; commits: number }>;

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.commits > 0) map.set(r.date, r.commits);
  }
  return map;
}

export function getGlobalFirstCommitDate(): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT MIN(date(timestamp)) AS d FROM commits
  `).get() as { d: string | null } | undefined;
  return row?.d ?? null;
}

export function getGlobalLastCommitDate(): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT MAX(date(timestamp)) AS d FROM commits
  `).get() as { d: string | null } | undefined;
  return row?.d ?? null;
}

export function getActiveDatesGlobal(): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT date(timestamp) AS d
    FROM commits
    ORDER BY d ASC
  `).all() as Array<{ d: string }>;
  return rows.map((r) => r.d);
}

export function getAllTimeStats(): AllTimeStats {
  const db = getDb();
  const sums = db.prepare(`
    SELECT
      COALESCE(SUM(commits_count), 0) AS total_commits,
      COALESCE(SUM(lines_added), 0)   AS total_added,
      COALESCE(SUM(lines_removed), 0) AS total_removed,
      COALESCE(SUM(files_touched), 0) AS total_files,
      COUNT(DISTINCT CASE WHEN commits_count > 0 THEN date END) AS days_active
    FROM daily_summaries
  `).get() as {
    total_commits: number;
    total_added: number;
    total_removed: number;
    total_files: number;
    days_active: number;
  };

  const repoCount = (db.prepare(`SELECT COUNT(*) AS c FROM repos`).get() as { c: number }).c;

  return {
    ...sums,
    repo_count: repoCount,
    first_commit: getGlobalFirstCommitDate(),
    last_commit: getGlobalLastCommitDate(),
  };
}
