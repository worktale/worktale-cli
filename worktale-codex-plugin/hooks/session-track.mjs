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

// OpenAI rate table (USD per 1M tokens). Cached input reads at 10% of input
// on the gpt-5.x family. NOTE: `cached` is a SUBSET of `input_tokens` in the
// Codex log format, so cost math must bill (input - cached) at `in`.
const PRICE_PER_MTOK = {
  // Current families (verified against developers.openai.com/api/docs/pricing)
  'gpt-5.6-sol':           { in: 5.00,  out: 30,   cacheRead: 0.50  },
  'gpt-5.6-terra':         { in: 2.50,  out: 15,   cacheRead: 0.25  },
  'gpt-5.6-luna':          { in: 1.00,  out: 6,    cacheRead: 0.10  },
  'gpt-5.5-pro':           { in: 30.00, out: 180,  cacheRead: 30.00 },
  'gpt-5.5':               { in: 5.00,  out: 30,   cacheRead: 0.50  },
  'gpt-5.4-pro':           { in: 30.00, out: 180,  cacheRead: 30.00 },
  'gpt-5.4-mini':          { in: 0.75,  out: 4.50, cacheRead: 0.075 },
  'gpt-5.4-nano':          { in: 0.20,  out: 1.25, cacheRead: 0.02  },
  'gpt-5.4':               { in: 2.50,  out: 15,   cacheRead: 0.25  },
  'gpt-5.3-codex':         { in: 1.75,  out: 14,   cacheRead: 0.175 },
  'chat-latest':           { in: 5.00,  out: 30,   cacheRead: 0.50  },
  // Legacy families, retained for historical transcripts.
  'gpt-5-mini':            { in: 0.25,  out: 2.00, cacheRead: 0.025 },
  'gpt-5-nano':            { in: 0.05,  out: 0.40, cacheRead: 0.005 },
  'gpt-5':                 { in: 1.25,  out: 10,   cacheRead: 0.125 },
  'gpt-4.1-mini':          { in: 0.40,  out: 1.60, cacheRead: 0.10  },
  'gpt-4.1-nano':          { in: 0.10,  out: 0.40, cacheRead: 0.025 },
  'gpt-4.1':               { in: 2.00,  out: 8,    cacheRead: 0.50  },
  'gpt-4o-mini':           { in: 0.15,  out: 0.60, cacheRead: 0.075 },
  'gpt-4o':                { in: 2.50,  out: 10,   cacheRead: 1.25  },
  'o3-mini':               { in: 1.10,  out: 4.40, cacheRead: 0.55  },
  'o3-pro':                { in: 20.00, out: 80,   cacheRead: 20.00 },
  'o3':                    { in: 2.00,  out: 8,    cacheRead: 0.50  },
  'o4-mini':               { in: 1.10,  out: 4.40, cacheRead: 0.275 },
  'o1-mini':               { in: 1.10,  out: 4.40, cacheRead: 0.55  },
  'o1':                    { in: 15.00, out: 60,   cacheRead: 7.50  },
  'codex-mini':            { in: 1.50,  out: 6,    cacheRead: 0.375 },
};

// Bare family keys whose longer suffixes denote a NEWER model rather than a
// variant — these must not prefix-match (gpt-5.7 is not gpt-5 pricing).
const EXACT_ONLY = new Set(['gpt-5', 'gpt-4o', 'gpt-4.1', 'o1', 'o3']);

// Tier fallback so a model released after this table was written still gets
// priced instead of silently costing $0.
const TIER_FALLBACK = [
  [/codex/, PRICE_PER_MTOK['gpt-5.3-codex']],
  [/-pro\b/, PRICE_PER_MTOK['gpt-5.5-pro']],
  [/nano/, PRICE_PER_MTOK['gpt-5.4-nano']],
  [/mini|luna/, PRICE_PER_MTOK['gpt-5.6-luna']],
  [/^(gpt|o)[-\d]/, PRICE_PER_MTOK['gpt-5.6-terra']],
];

function normalizeModel(model) {
  // Dots are significant in OpenAI ids (gpt-4.1, gpt-5.6) — do not strip them.
  return String(model).toLowerCase().trim()
    .replace(/^openai\//, '')
    .replace(/@.*$/, '')
    .replace(/-\d{8}$/, '')      // date snapshot: -20250805
    .replace(/-(preview|latest)$/, '')
    .replace(/[\s_]+/g, '-');
}

function resolvePrice(model) {
  if (!model) return null;
  const norm = normalizeModel(model);
  if (PRICE_PER_MTOK[norm]) return PRICE_PER_MTOK[norm];
  // Prefix match (longest first) so gpt-4.1-mini wins over gpt-4.1
  const keys = Object.keys(PRICE_PER_MTOK)
    .filter((k) => !EXACT_ONLY.has(k))
    .sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm.startsWith(key)) return PRICE_PER_MTOK[key];
  }
  for (const [pattern, price] of TIER_FALLBACK) {
    if (pattern.test(norm)) return price;
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

// Bucket shape matches the Anthropic tracker so both hooks aggregate and
// price identically. `input` is the NON-cached remainder; cached reads live
// in `cacheRead`. OpenAI has no cache-write charge, so `cacheWrite` stays 0.
function bucketFor(acc, model) {
  const key = model || '_unknown';
  if (!acc.perModel.has(key)) {
    acc.perModel.set(key, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  }
  return acc.perModel.get(key);
}

// Attribute a turn's token delta to whichever model was active for that turn.
function addDelta(acc, dInput, dCached, dOutput) {
  const cached = Math.max(0, dCached);
  const uncached = Math.max(0, dInput - cached);
  const bucket = bucketFor(acc, acc.currentModel);
  bucket.input += uncached;
  bucket.cacheRead += cached;
  bucket.output += Math.max(0, dOutput);
}

function parseSessionFile(path) {
  const acc = {
    perModel: new Map(),
    currentModel: null,  // model active for the turn being read
    model: null,         // primary/last-seen model, used as the session label
    cwd: null,
    sessionId: null,
    firstTs: null,
    lastTs: null,
    previousTotals: null, // for delta math
    sawPerTurn: false,    // saw last_token_usage entries (already banked)
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
      if (model) {
        // Switches the bucket that subsequent token deltas are charged to.
        acc.currentModel = String(model);
        acc.model = String(model);
      }
      continue;
    }

    if (type === 'token_count' || payload?.type === 'token_count') {
      const info = payload.info ?? payload;
      const total = info.total_token_usage ?? info.totalTokenUsage;
      const last = info.last_token_usage ?? info.lastTokenUsage;
      // A model named on the token_count itself is the most precise
      // attribution available for this turn's tokens.
      const m = pickField(info, ['model']);
      if (m) {
        acc.currentModel = String(m);
        if (!acc.model) acc.model = String(m);
      }

      if (total) {
        const tIn  = pickField(total, ['input_tokens', 'inputTokens']) ?? 0;
        const tCache = pickField(total, ['cached_input_tokens', 'cachedInputTokens', 'cache_read_input_tokens', 'cacheReadInputTokens']) ?? 0;
        const tOut = pickField(total, ['output_tokens', 'outputTokens']) ?? 0;
        const prev = acc.previousTotals;
        // A cumulative counter that moved backwards means Codex reset it
        // (compaction, or a new conversation in the same file). Treat the new
        // reading as a fresh baseline and bank it whole rather than clamping
        // the delta to 0, which silently discarded the turn.
        const isReset = prev && (tIn < prev.input || tCache < prev.cached || tOut < prev.output);
        if (prev && !isReset) {
          addDelta(acc, tIn - prev.input, tCache - prev.cached, tOut - prev.output);
        } else if (!prev && acc.sawPerTurn) {
          // Per-turn entries already banked these tokens; adopt this reading as
          // the baseline without re-adding it.
        } else {
          addDelta(acc, tIn, tCache, tOut);
        }
        acc.previousTotals = { input: tIn, cached: tCache, output: tOut };
      } else if (last) {
        // Per-turn deltas: add directly, and leave previousTotals untouched so
        // a later cumulative reading still diffs against the right baseline.
        const dIn  = pickField(last, ['input_tokens', 'inputTokens']) ?? 0;
        const dCache = pickField(last, ['cached_input_tokens', 'cachedInputTokens', 'cache_read_input_tokens', 'cacheReadInputTokens']) ?? 0;
        const dOut = pickField(last, ['output_tokens', 'outputTokens']) ?? 0;
        addDelta(acc, dIn, dCache, dOut);
        acc.sawPerTurn = true;
      }
    }
  }

  return acc;
}

function totals(acc) {
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  for (const b of acc.perModel.values()) {
    input += b.input;
    output += b.output;
    cacheRead += b.cacheRead;
    cacheWrite += b.cacheWrite;
  }
  return { input, output, cacheRead, cacheWrite };
}

// Each model's tokens are priced at that model's own rate. Buckets are already
// cache-split by addDelta, so `input` here is the non-cached remainder.
function computeCost(acc) {
  let cost = 0;
  for (const [model, b] of acc.perModel.entries()) {
    const price = resolvePrice(model === '_unknown' ? acc.model : model);
    if (!price) continue;
    cost +=
      (b.input / 1_000_000) * price.in +
      (b.output / 1_000_000) * price.out +
      (b.cacheRead / 1_000_000) * (price.cacheRead ?? 0) +
      // OpenAI has no cache-write charge; guard so a missing rate can't turn
      // the whole cost into NaN.
      (b.cacheWrite / 1_000_000) * (price.cacheWrite ?? 0);
  }
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
    // Buckets are already cache-split, so `t.input` is the non-cached
    // remainder — the same meaning `input_tokens` has in the Anthropic tracker.
    const t = totals(parsed);
    const grandTotal = t.input + t.cacheRead + t.output;
    if (grandTotal < MIN_TOKENS) {
      state.processed[f.path] = { recordedAt: now, status: 'too-small', tokens: grandTotal };
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
    if (t.input > 0) args.push('--input-tokens', String(t.input));
    if (t.output > 0) args.push('--output-tokens', String(t.output));
    if (t.cacheRead > 0) args.push('--cache-read-tokens', String(t.cacheRead));
    if (t.cacheWrite > 0) args.push('--cache-write-tokens', String(t.cacheWrite));
    if (cost > 0) args.push('--cost', cost.toFixed(4));
    if (durationSecs) args.push('--duration', String(durationSecs));

    const exit = callWorktale(args, parsed.cwd);
    state.processed[f.path] = {
      recordedAt: now,
      status: exit === 0 ? 'ok' : 'failed',
      model: parsed.model,
      input: t.input,
      cacheRead: t.cacheRead,
      output: t.output,
      cost,
      sessionId: parsed.sessionId,
      perModel: Object.fromEntries(parsed.perModel),
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
