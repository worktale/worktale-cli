import { getDb } from './index.js';

export interface AiSession {
  id: number;
  repo_id: number;
  date: string;
  provider: string | null;
  model: string | null;
  tool: string | null;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  tools_used: string | null;   // JSON array
  mcp_servers: string | null;  // JSON array
  duration_secs: number;
  commits: string | null;      // JSON array of SHAs
  note: string | null;
  timestamp: string;
}

export interface AiSessionInsert {
  repo_id: number;
  date: string;
  provider?: string;
  model?: string;
  tool?: string;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  tools_used?: string[];
  mcp_servers?: string[];
  duration_secs?: number;
  commits?: string[];
  note?: string;
}

export interface AiSessionStats {
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
}

export function insertAiSession(session: AiSessionInsert): number {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO ai_sessions (repo_id, date, provider, model, tool, cost_usd, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, tools_used, mcp_servers, duration_secs, commits, note, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.repo_id,
    session.date,
    session.provider ?? null,
    session.model ?? null,
    session.tool ?? null,
    session.cost_usd ?? 0,
    session.input_tokens ?? 0,
    session.output_tokens ?? 0,
    session.cache_read_tokens ?? 0,
    session.cache_write_tokens ?? 0,
    session.tools_used ? JSON.stringify(session.tools_used) : null,
    session.mcp_servers ? JSON.stringify(session.mcp_servers) : null,
    session.duration_secs ?? 0,
    session.commits ? JSON.stringify(session.commits) : null,
    session.note ?? null,
    now,
  );

  return result.lastInsertRowid as number;
}

export function getAiSessionsByDate(repoId: number, date: string): AiSession[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ai_sessions WHERE repo_id = ? AND date = ? ORDER BY timestamp DESC
  `).all(repoId, date) as AiSession[];
}

export function getAiSessionsRange(repoId: number, startDate: string, endDate: string): AiSession[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM ai_sessions WHERE repo_id = ? AND date >= ? AND date <= ? ORDER BY timestamp DESC
  `).all(repoId, startDate, endDate) as AiSession[];
}

export function getAiSessionStats(repoId: number, days: number = 30): AiSessionStats {
  const db = getDb();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const sessions = db.prepare(`
    SELECT * FROM ai_sessions WHERE repo_id = ? AND date >= ? ORDER BY timestamp DESC
  `).all(repoId, sinceStr) as AiSession[];

  const stats: AiSessionStats = {
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
  };

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
  }

  return stats;
}

export function getAiSessionCountByDate(repoId: number, date: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM ai_sessions WHERE repo_id = ? AND date = ?').get(repoId, date) as { cnt: number };
  return row.cnt;
}

export function getAiCostByDate(repoId: number, date: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM ai_sessions WHERE repo_id = ? AND date = ?').get(repoId, date) as { total: number };
  return row.total;
}

export function getAiTokensByDate(repoId: number, date: string): { input: number; output: number } {
  const db = getDb();
  const row = db.prepare('SELECT COALESCE(SUM(input_tokens), 0) as inp, COALESCE(SUM(output_tokens), 0) as out FROM ai_sessions WHERE repo_id = ? AND date = ?').get(repoId, date) as { inp: number; out: number };
  return { input: row.inp, output: row.out };
}

export function getDailyAiSummary(repoId: number, startDate: string, endDate: string): Array<{ date: string; sessions: number; cost: number; tokens: number }> {
  const db = getDb();
  return db.prepare(`
    SELECT date, COUNT(*) as sessions, COALESCE(SUM(cost_usd), 0) as cost, COALESCE(SUM(input_tokens + output_tokens), 0) as tokens
    FROM ai_sessions WHERE repo_id = ? AND date >= ? AND date <= ?
    GROUP BY date ORDER BY date ASC
  `).all(repoId, startDate, endDate) as Array<{ date: string; sessions: number; cost: number; tokens: number }>;
}
