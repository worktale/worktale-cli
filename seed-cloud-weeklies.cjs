// Insert weekly_digests rows directly into the cloud Postgres for the
// worktaleDemo backfill window. The cloud API can't do this because the
// `daily_digest_ids` column is varchar(255) and a full week of 7 daily
// digest GUIDs comma-joined exceeds that, so POST /weekly 500s.
//
// We bypass that by writing rows ourselves with content trimmed to <=255 chars.
//
// Idempotent: ON CONFLICT does nothing for (user_id, week_start_date) duplicates.
//
// Usage: node seed-cloud-weeklies.cjs                 # all weeks Jan 5 -> Apr 26
//        node seed-cloud-weeklies.cjs --dry-run

const { Client } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const PG_URL = 'postgresql://postgres:PaBaVLUgFprspNLflyyTLEOFyoXyxVEE@caboose.proxy.rlwy.net:30167/railway';
const USER_ID = '2cccea1c-ed73-4240-acbd-673c9b88898b';   // plsft
const REPO_ID_LOCAL = 10;                                  // worktaleDemo in local SQLite
const SQLITE = path.join(os.homedir(), '.worktale', 'data.db');

const dryRun = process.argv.includes('--dry-run');

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

// All Mondays from 2026-01-05 (Mon) to 2026-04-20 (Mon) — 16 weeks.
function weekStarts() {
  const out = [];
  let d = new Date(Date.UTC(2026, 0, 5));
  const end = new Date(Date.UTC(2026, 3, 20));
  while (d <= end) {
    out.push(new Date(d));
    d = addDays(d, 7);
  }
  return out;
}

function clip(s, max = 250) {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + '...';
}

(async () => {
  const sqlite = new Database(SQLITE, { readonly: true });
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  // Pull existing daily-digest IDs from cloud, keyed by date string.
  const dailyRes = await pg.query(
    `SELECT id, date FROM daily_digests WHERE user_id = $1 ORDER BY date`,
    [USER_ID],
  );
  const dailyByDate = new Map();
  for (const r of dailyRes.rows) {
    const key = fmtDate(new Date(r.date));
    dailyByDate.set(key, r.id);
  }
  console.log(`Found ${dailyByDate.size} cloud daily digests for user`);

  let inserted = 0, updated = 0, skipped = 0;

  for (const weekStart of weekStarts()) {
    const weekEnd = addDays(weekStart, 6);
    const wsStr = fmtDate(weekStart);
    const weStr = fmtDate(weekEnd);

    // Aggregate from local SQLite for this week.
    const rows = sqlite.prepare(`
      SELECT DATE(timestamp) AS date, COUNT(*) AS commits,
             SUM(lines_added) AS la, SUM(lines_removed) AS lr, SUM(files_changed) AS fc
      FROM commits WHERE repo_id = ? AND DATE(timestamp) >= ? AND DATE(timestamp) <= ?
      GROUP BY DATE(timestamp) ORDER BY date
    `).all(REPO_ID_LOCAL, wsStr, weStr);
    if (rows.length === 0) { skipped++; continue; }

    const totals = rows.reduce((a, r) => ({
      c: a.c + r.commits, la: a.la + (r.la || 0),
      lr: a.lr + (r.lr || 0), fc: a.fc + (r.fc || 0),
    }), { c: 0, la: 0, lr: 0, fc: 0 });
    const activeDays = rows.length;

    const ai = sqlite.prepare(`
      SELECT COUNT(*) AS sessions, COALESCE(SUM(cost_usd), 0) AS cost,
             COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
      FROM ai_sessions WHERE repo_id = ? AND date >= ? AND date <= ?
    `).get(REPO_ID_LOCAL, wsStr, weStr);

    // Compose summary (<= 250 chars to fit varchar(255))
    const aiPart = ai.sessions > 0
      ? ` AI: ${ai.sessions} sessions, $${Number(ai.cost).toFixed(2)}, ${Math.round(ai.tokens / 1000)}k tokens.`
      : '';
    const summary = clip(
      `Week of ${wsStr}: ${totals.c} commits across ${activeDays}/7 days, +${totals.la}/-${totals.lr} lines on ${totals.fc} files.` + aiPart,
    );

    const stats = clip(JSON.stringify({
      commits: totals.c,
      lines_added: totals.la,
      lines_removed: totals.lr,
      files_changed: totals.fc,
      active_days: activeDays,
      repos_active: 1,
    }));

    // Build daily_digest_ids — pull from cloud, truncate to fit 255 chars.
    const ids = [];
    for (let i = 0; i < 7; i++) {
      const dStr = fmtDate(addDays(weekStart, i));
      const id = dailyByDate.get(dStr);
      if (id) ids.push(id);
    }
    let digestIds = ids.join(',');
    while (digestIds.length > 255 && ids.length > 0) {
      ids.pop();
      digestIds = ids.join(',');
    }

    if (dryRun) {
      console.log(`[dry-run] ${wsStr}->${weStr}  c=${totals.c} +${totals.la}/-${totals.lr} ai=${ai.sessions}  ids=${ids.length}/7 (${digestIds.length}c)  sum=${summary.length}c`);
      continue;
    }

    // Upsert.
    const existing = await pg.query(
      `SELECT id FROM weekly_digests WHERE user_id = $1 AND week_start_date = $2`,
      [USER_ID, wsStr],
    );
    if (existing.rows.length > 0) {
      await pg.query(
        `UPDATE weekly_digests SET week_end_date=$1, ai_summary=$2, published_text=$3, stats=$4, daily_digest_ids=$5, is_published=true, published_at=NOW(), updated_at=NOW() WHERE id=$6`,
        [weStr, summary, summary, stats, digestIds, existing.rows[0].id],
      );
      updated++;
      console.log(`  ⟳ ${wsStr}  updated  c=${totals.c} ai=${ai.sessions}`);
    } else {
      await pg.query(
        `INSERT INTO weekly_digests (id, user_id, week_start_date, week_end_date, ai_summary, published_text, repo_breakdown, stats, daily_digest_ids, is_published, published_at, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, '', $6, $7, true, NOW(), NOW(), NOW())`,
        [USER_ID, wsStr, weStr, summary, summary, stats, digestIds],
      );
      inserted++;
      console.log(`  + ${wsStr}  inserted  c=${totals.c} ai=${ai.sessions}`);
    }
  }

  sqlite.close();
  await pg.end();

  console.log(`\nInserted: ${inserted}  Updated: ${updated}  Skipped (no commits): ${skipped}`);
})().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
