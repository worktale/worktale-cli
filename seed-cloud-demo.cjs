// Backfill the worktaleDemo project's history into Worktale Cloud.
//
// Mirrors what `worktale publish` does, but loops over every active day
// in the local SQLite DB instead of just today. Idempotent: the cloud's
// /digests POST is upsert-by-(user, repo, date), so re-runs update existing rows.
//
// Usage:  node seed-cloud-demo.cjs            # publish all 106 active days
//         node seed-cloud-demo.cjs --dry-run  # log payloads without sending
//         node seed-cloud-demo.cjs --since 2026-04-16  # only days >= date
//
// Environment: reads token + API URL from ~/.worktale/config.json.

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ID_LOCAL = 10;       // worktaleDemo in local SQLite
const REPO_NAME = 'worktaleDemo';
const REPO_SLUG = 'worktaledemo';
const DB_PATH = path.join(os.homedir(), '.worktale', 'data.db');
const CONFIG_PATH = path.join(os.homedir(), '.worktale', 'config.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sinceIdx = args.indexOf('--since');
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const TOKEN = config.cloudToken;
const API_URL = config.cloudApiUrl || 'https://api.worktale.dev';
if (!TOKEN) {
  console.error('No cloudToken in ~/.worktale/config.json. Run `worktale cloud login` first.');
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status}: ${body}`);
  }
  return res.json();
}

function buildDayPayload(db, date) {
  const commits = db.prepare(`
    SELECT sha, message, lines_added, lines_removed, files_changed
    FROM commits WHERE repo_id = ? AND DATE(timestamp) = ?
    ORDER BY timestamp ASC
  `).all(REPO_ID_LOCAL, date);

  if (commits.length === 0) return null;

  const summary = db.prepare(`
    SELECT commits_count, lines_added, lines_removed, files_touched, user_notes, ai_draft
    FROM daily_summaries WHERE repo_id = ? AND date = ?
  `).get(REPO_ID_LOCAL, date);

  const modules = db.prepare(`
    SELECT module, SUM(changes) AS changes FROM file_activity
    WHERE repo_id = ? AND date = ? AND module IS NOT NULL
    GROUP BY module ORDER BY changes DESC
  `).all(REPO_ID_LOCAL, date);
  const totalChanges = modules.reduce((s, r) => s + r.changes, 0);
  const moduleActivity = {};
  for (const m of modules) {
    if (totalChanges > 0) moduleActivity[m.module] = m.changes / totalChanges;
  }

  const aiSessions = db.prepare(`
    SELECT provider, model, tool, cost_usd, input_tokens, output_tokens, duration_secs
    FROM ai_sessions WHERE repo_id = ? AND date = ?
  `).all(REPO_ID_LOCAL, date);
  const aiSessionData = aiSessions.length > 0 ? {
    sessions: aiSessions.length,
    cost: aiSessions.reduce((s, a) => s + a.cost_usd, 0),
    tokens: aiSessions.reduce((s, a) => s + a.input_tokens + a.output_tokens, 0),
    tools: [...new Set(aiSessions.map((a) => a.tool).filter(Boolean))],
    models: [...new Set(aiSessions.map((a) => a.model).filter(Boolean))],
    providers: [...new Set(aiSessions.map((a) => a.provider).filter(Boolean))],
  } : null;

  return {
    repoName: REPO_NAME,
    repoSlug: REPO_SLUG,
    date,
    commitsCount: summary?.commits_count ?? commits.length,
    linesAdded: summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0),
    linesRemoved: summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0),
    filesChanged: summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0),
    commitMessages: JSON.stringify(commits.map((c) => c.message).filter(Boolean)),
    moduleActivity: JSON.stringify(moduleActivity),
    userNotes: summary?.user_notes ?? null,
    aiDraft: summary?.ai_draft ?? null,
    aiSessions: aiSessionData ? JSON.stringify(aiSessionData) : null,
  };
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const db = new Database(DB_PATH, { readonly: true });

  let dateRows = db.prepare(`
    SELECT DATE(timestamp) AS date FROM commits
    WHERE repo_id = ? GROUP BY DATE(timestamp) ORDER BY date ASC
  `).all(REPO_ID_LOCAL);
  if (since) dateRows = dateRows.filter((d) => d.date >= since);

  console.log(`API:    ${API_URL}`);
  console.log(`User:   ${TOKEN.slice(0, 12)}...`);
  console.log(`Repo:   ${REPO_NAME} (${REPO_SLUG})`);
  console.log(`Days:   ${dateRows.length}${since ? ` (since ${since})` : ''}`);
  console.log(`Mode:   ${dryRun ? 'DRY RUN' : 'LIVE PUBLISH'}`);
  console.log('');

  let posted = 0, published = 0, failed = 0;
  const summary = { totalCommits: 0, totalLines: 0, aiSessions: 0, aiCost: 0 };

  for (const { date } of dateRows) {
    const payload = buildDayPayload(db, date);
    if (!payload) continue;

    summary.totalCommits += payload.commitsCount;
    summary.totalLines += payload.linesAdded;
    if (payload.aiSessions) {
      const parsed = JSON.parse(payload.aiSessions);
      summary.aiSessions += parsed.sessions;
      summary.aiCost += parsed.cost;
    }

    if (dryRun) {
      console.log(`[dry-run] ${date}  ${payload.commitsCount}c  +${payload.linesAdded}/-${payload.linesRemoved}  ai:${payload.aiSessions ? 'yes' : 'no'}`);
      continue;
    }

    try {
      const post = await api('/api/v1/digests', { method: 'POST', body: payload });
      const id = post?.data?.id;
      posted++;

      if (id) {
        await api(`/api/v1/digests/${id}`, { method: 'PATCH', body: { isPublished: true } });
        published++;
      }
      console.log(`  ✓ ${date}  ${payload.commitsCount}c  +${payload.linesAdded}/-${payload.linesRemoved}  ${payload.aiSessions ? 'ai' : '  '}  id=${id?.slice(0,8) ?? '?'}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${date}  ${err.message}`);
    }

    await sleep(75);  // be polite to the API
  }

  db.close();

  console.log('');
  console.log('==== Summary ====');
  console.log(`Days processed:  ${dateRows.length}`);
  console.log(`POSTed:          ${posted}`);
  console.log(`Published:       ${published}`);
  console.log(`Failed:          ${failed}`);
  console.log(`Total commits:   ${summary.totalCommits}`);
  console.log(`Total lines:     +${summary.totalLines}`);
  console.log(`AI sessions:     ${summary.aiSessions}`);
  console.log(`AI cost:         $${summary.aiCost.toFixed(2)}`);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
