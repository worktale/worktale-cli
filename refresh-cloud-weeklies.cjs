// Refresh stale weekly digests by overriding publishedText with fresh
// stats computed from local SQLite. The cloud's PATCH /weekly endpoint
// supports publishedText updates; the page renders PublishedText ?? AiSummary,
// so the stale AiSummary stays in the row but is no longer shown.
//
// Usage: node refresh-cloud-weeklies.cjs 2026-04-13 2026-03-30

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ID_LOCAL = 10;  // worktaleDemo
const DB_PATH = path.join(os.homedir(), '.worktale', 'data.db');
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.worktale', 'config.json'), 'utf8'));
const TOKEN = config.cloudToken;
const API_URL = config.cloudApiUrl || 'https://api.worktale.dev';

const weekStarts = process.argv.slice(2);
if (weekStarts.length === 0) {
  console.error('Pass one or more YYYY-MM-DD week-start dates.');
  process.exit(1);
}

async function api(p, opts = {}) {
  const res = await fetch(`${API_URL}${p}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${p} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function computeWeekStats(db, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const rows = db.prepare(`
    SELECT DATE(timestamp) AS date, COUNT(*) AS commits,
           SUM(lines_added) AS la, SUM(lines_removed) AS lr, SUM(files_changed) AS fc,
           GROUP_CONCAT(message, '|') AS messages
    FROM commits WHERE repo_id = ? AND DATE(timestamp) >= ? AND DATE(timestamp) <= ?
    GROUP BY DATE(timestamp) ORDER BY date
  `).all(REPO_ID_LOCAL, weekStart, weekEnd);

  const totals = rows.reduce((acc, r) => ({
    commits: acc.commits + r.commits,
    linesAdded: acc.linesAdded + (r.la || 0),
    linesRemoved: acc.linesRemoved + (r.lr || 0),
    filesChanged: acc.filesChanged + (r.fc || 0),
  }), { commits: 0, linesAdded: 0, linesRemoved: 0, filesChanged: 0 });

  const ai = db.prepare(`
    SELECT COUNT(*) AS sessions, COALESCE(SUM(cost_usd), 0) AS cost,
           COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
    FROM ai_sessions WHERE repo_id = ? AND date >= ? AND date <= ?
  `).get(REPO_ID_LOCAL, weekStart, weekEnd);

  // Top commit themes — flatten messages and pick the longest/distinctive
  const allMessages = rows.flatMap((r) => (r.messages || '').split('|').filter(Boolean));
  const topMessages = allMessages.slice(0, 6);

  return { weekEnd, activeDays: rows.length, totals, ai, topMessages };
}

function buildMarkdown(weekStart, s) {
  // The cloud's publishedText column appears to be varchar(~255), so we keep
  // this tight: one line of headline stats, one line of AI summary.
  const t = s.totals;
  const head = `Week of ${weekStart}: ${t.commits} commits across ${s.activeDays}/7 days, +${t.linesAdded}/-${t.linesRemoved} lines on ${t.filesChanged} files.`;
  const ai = s.ai.sessions > 0
    ? ` AI: ${s.ai.sessions} sessions, $${s.ai.cost.toFixed(2)}, ${Math.round(s.ai.tokens / 1000)}k tokens.`
    : '';
  let out = head + ai;
  if (out.length > 240) out = out.slice(0, 237) + '...';
  return out;
}

(async () => {
  const db = new Database(DB_PATH, { readonly: true });
  const weeklies = await api('/api/v1/weekly?page=1&pageSize=50');
  const byStart = new Map((weeklies.data || []).map((w) => [w.weekStartDate, w]));

  for (const ws of weekStarts) {
    const w = byStart.get(ws);
    if (!w) {
      console.log(`  ✗ ${ws}  no weekly digest found`);
      continue;
    }
    const stats = computeWeekStats(db, ws);
    const md = buildMarkdown(ws, stats);

    try {
      // PATCH with isPublished triggers PublishAsync which 500s; pass only publishedText.
      await api(`/api/v1/weekly/${w.id}`, {
        method: 'PATCH',
        body: { publishedText: md },
      });
      console.log(`  ✓ ${ws}  ${stats.totals.commits}c +${stats.totals.linesAdded}/-${stats.totals.linesRemoved}  ${stats.activeDays}/7 days  ai:${stats.ai.sessions}  ($${stats.ai.cost.toFixed(2)})`);
    } catch (err) {
      console.log(`  ✗ ${ws}  ${err.message}`);
    }
  }
  db.close();
})().catch((err) => { console.error('Fatal:', err); process.exit(1); });
