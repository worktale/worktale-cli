#!/usr/bin/env node
// Worktale Codex session tracker.
//
// Parses ~/.codex/sessions/YYYY/MM/DD/*.jsonl files written by the Codex CLI
// and records aggregate token usage + computed cost per session via
// `worktale session add`.
//
// Approach (handles Codex's per-turn Stop hook firing):
//   1. On each invocation, scan recent session files in ~/.codex/sessions
//   2. Skip files already recorded (tracked in ~/.worktale/codex-processed.json)
//   3. Skip files that were modified within the last STALE_MIN minutes
//      (treat them as still-active — wait for next invocation)
//   4. For "stale" (i.e. finished) files, parse, sum tokens, compute cost,
//      shell out to `worktale session add`, mark processed.
//
// Token format reference: see CodexMonitor's local_usage_core.rs for the
// canonical handling of total_token_usage / last_token_usage deltas.

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
const SESSIONS_ROOT = join(CODEX_HOME, 'sessions');
const STATE_DIR = join(homedir(), '.worktale');
const STATE_FILE = join(STATE_DIR, 'codex-processed.json');
const STALE_MIN = 5;       // minutes after last modification before we treat a session as ended
const SCAN_DAYS = 7;       // how many recent days of session dirs to consider
const MIN_TOKENS = 100;    // ignore tiny sessions (probably aborted)
const DRY_RUN = process.env.WORKTALE_HOOK_DRY_RUN === '1';

// OpenAI rate table (USD per 1M tokens). Cached input is read at 50% of input.
const PRICE_PER_MTOK = {
  'gpt-5':                 { in: 15,    out: 60,   cacheRead: 7.5  },
  'gpt-5-mini':            { in: 0.30,  out: 2.40, cacheRead: 0.15 },
  'gpt-5-nano':            { in: 0.10,  out: 0.80, cacheRead: 0.05 },
  'o3':                    { in: 15,    out: 60,   cacheRead: 7.5  },
  'o3-mini':               { in: 1.10,  out: 4.40, cacheRead: 0.55 },
  'o3-pro':                { in: 25,    out: 100,  cacheRead: 12.5 },
  'o1':                    { in: 15,    out: 60,   cacheRead: 7.5  },
  'o1-mini':               { in: 1.10,  out: 4.40, cacheRead: 0.55 },
  'o4':                    { in: 15,    out: 60,   cacheRead: 7.5  },
  'o4-mini':               { in: 1.10,  out: 4.40, cacheRead: 0.55 },
  'gpt-4o':                { in: 2.50,  out: 10,   cacheRead: 1.25 },
  'gpt-4o-mini':           { in: 0.15,  out: 0.60, cacheRead: 0.075 },
  'gpt-4.1':               { in: 2.00,  out: 8,    cacheRead: 1.00 },
  'gpt-4.1-mini':          { in: 0.40,  out: 1.60, cacheRead: 0.20 },
  'gpt-4.1-nano':          { in: 0.10,  out: 0.40, cacheRead: 0.05 },
  'codex-mini':            { in: 1.50,  out: 6,    cacheRead: 0.75 },
};

function resolvePrice(model) {
  if (!model) return null;
  const norm = model.toLowerCase()
    .replace(/^openai\//, '')
    .replace(/-\d{8}$/, '')   // strip date suffix like -20250805
    .replace(/-preview$/, '')
    .replace(/@.*$/, '');
  if (PRICE_PER_MTOK[norm]) return PRICE_PER_MTOK[norm];
  // Prefix match (longest first) so gpt-4.1-mini wins over gpt-4
  const keys = Object.keys(PRICE_PER_MTOK).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm.startsWith(key)) return PRICE_PER_MTOK[key];
  }
  return null;
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { processed: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { processed: {} }; }
}

function saveState(state) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function listRecentSessionFiles() {
  if (!existsSync(SESSIONS_ROOT)) return [];
  const out = [];
  const cutoff = Date.now() - SCAN_DAYS * 24 * 60 * 60 * 1000;

  function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else if (e.isFile() && full.endsWith('.jsonl')) {
        try {
          const st = statSync(full);
          if (st.mtimeMs >= cutoff) out.push({ path: full, mtime: st.mtimeMs });
        } catch {}
      }
    }
  }
  walk(SESSIONS_ROOT, 0);
  return out;
}

function pickField(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  return undefined;
}

function parseSessionFile(path) {
  const acc = {
    input: 0,
    cached: 0,
    output: 0,
    model: null,
    cwd: null,
    sessionId: null,
    firstTs: null,
    lastTs: null,
    previousTotals: null, // for delta math
  };

  let raw;
  try { raw = readFileSync(path, 'utf-8'); }
  catch { return null; }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); }
    catch { continue; }

    const ts = obj.timestamp ? Date.parse(obj.timestamp) : null;
    if (ts) {
      if (acc.firstTs === null || ts < acc.firstTs) acc.firstTs = ts;
      if (acc.lastTs === null || ts > acc.lastTs) acc.lastTs = ts;
    }

    const type = obj.type ?? obj.payload?.type;
    const payload = obj.payload ?? obj;

    if (type === 'session_meta') {
      const cwd = pickField(payload, ['cwd', 'workspace', 'working_dir']);
      if (cwd) acc.cwd = cwd;
      const sid = pickField(payload, ['id', 'session_id', 'sessionId']);
      if (sid) acc.sessionId = sid;
      continue;
    }

    if (type === 'turn_context') {
      const model = pickField(payload, ['model']) || pickField(payload?.info, ['model']);
      if (model) acc.model = String(model);
      continue;
    }

    if (type === 'token_count' || payload?.type === 'token_count') {
      const info = payload.info ?? payload;
      const total = info.total_token_usage ?? info.totalTokenUsage;
      const last = info.last_token_usage ?? info.lastTokenUsage;
      const m = pickField(info, ['model']);
      if (m && !acc.model) acc.model = String(m);

      if (total) {
        const tIn  = pickField(total, ['input_tokens', 'inputTokens']) ?? 0;
        const tCache = pickField(total, ['cached_input_tokens', 'cachedInputTokens', 'cache_read_input_tokens', 'cacheReadInputTokens']) ?? 0;
        const tOut = pickField(total, ['output_tokens', 'outputTokens']) ?? 0;
        if (acc.previousTotals) {
          acc.input  += Math.max(0, tIn  - acc.previousTotals.input);
          acc.cached += Math.max(0, tCache - acc.previousTotals.cached);
          acc.output += Math.max(0, tOut - acc.previousTotals.output);
        } else {
          acc.input  += tIn;
          acc.cached += tCache;
          acc.output += tOut;
        }
        acc.previousTotals = { input: tIn, cached: tCache, output: tOut };
      } else if (last) {
        const dIn  = pickField(last, ['input_tokens', 'inputTokens']) ?? 0;
        const dCache = pickField(last, ['cached_input_tokens', 'cachedInputTokens', 'cache_read_input_tokens', 'cacheReadInputTokens']) ?? 0;
        const dOut = pickField(last, ['output_tokens', 'outputTokens']) ?? 0;
        acc.input  += dIn;
        acc.cached += dCache;
        acc.output += dOut;
        // Mark as if we'd seen totals = current sum so subsequent total entries don't double count
        acc.previousTotals = { input: acc.input, cached: acc.cached, output: acc.output };
      }
    }
  }

  return acc;
}

function computeCost(parsed) {
  const price = resolvePrice(parsed.model);
  if (!price) return 0;
  const cost =
    (parsed.input  / 1_000_000) * price.in +
    (parsed.cached / 1_000_000) * price.cacheRead +
    (parsed.output / 1_000_000) * price.out;
  return Math.round(cost * 10000) / 10000;
}

function callWorktale(args, cwd) {
  if (DRY_RUN) {
    console.log(JSON.stringify({ cwd, args }));
    return 0;
  }
  const result = spawnSync('worktale', args, {
    cwd: cwd || process.cwd(),
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  return result.status ?? 0;
}

function main() {
  if (!existsSync(SESSIONS_ROOT)) process.exit(0);

  const state = loadState();
  state.processed ||= {};

  const files = listRecentSessionFiles().sort((a, b) => a.mtime - b.mtime);
  const now = Date.now();
  const staleCutoff = now - STALE_MIN * 60 * 1000;

  let recorded = 0;
  for (const f of files) {
    if (state.processed[f.path]) continue;
    if (f.mtime > staleCutoff) continue; // session is still active

    const parsed = parseSessionFile(f.path);
    if (!parsed) {
      state.processed[f.path] = { recordedAt: now, status: 'unreadable' };
      continue;
    }
    const totalIn = parsed.input + parsed.cached;
    if (totalIn + parsed.output < MIN_TOKENS) {
      state.processed[f.path] = { recordedAt: now, status: 'too-small', tokens: totalIn + parsed.output };
      continue;
    }

    const cost = computeCost(parsed);
    const durationSecs = parsed.firstTs && parsed.lastTs
      ? Math.max(1, Math.round((parsed.lastTs - parsed.firstTs) / 1000))
      : null;

    const args = [
      'session', 'add',
      '--provider', 'openai',
      '--tool', 'codex',
    ];
    if (parsed.model) args.push('--model', parsed.model);
    if (totalIn > 0) args.push('--input-tokens', String(totalIn));
    if (parsed.output > 0) args.push('--output-tokens', String(parsed.output));
    if (cost > 0) args.push('--cost', cost.toFixed(4));
    if (durationSecs) args.push('--duration', String(durationSecs));

    const exit = callWorktale(args, parsed.cwd);
    state.processed[f.path] = {
      recordedAt: now,
      status: exit === 0 ? 'ok' : 'failed',
      model: parsed.model,
      input: totalIn,
      output: parsed.output,
      cost,
      sessionId: parsed.sessionId,
    };
    if (exit === 0) recorded += 1;
  }

  // Trim state file to last 500 entries to keep it bounded
  const entries = Object.entries(state.processed);
  if (entries.length > 500) {
    const sorted = entries.sort((a, b) => (b[1].recordedAt || 0) - (a[1].recordedAt || 0));
    state.processed = Object.fromEntries(sorted.slice(0, 500));
  }
  saveState(state);

  if (DRY_RUN) console.log(`# recorded ${recorded} sessions`);
  process.exit(0);
}

main();
