#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const LOG_DIR = join(homedir(), '.worktale');
const LOG_PATH = join(LOG_DIR, 'hook.log');

function log(level, message, extra) {
  if (process.env.WORKTALE_HOOK_DRY_RUN === '1') return;
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(extra || {}),
    });
    appendFileSync(LOG_PATH, line + '\n');
  } catch {
    // Logging is best-effort; never let it propagate.
  }
}

const PRICE_PER_MTOK = {
  'claude-opus-4': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-1': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-5': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-6': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-opus-4-7': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-5': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-6': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5': { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

function resolvePrice(model) {
  if (!model) return null;
  const normalized = model.toLowerCase().replace(/\[.*?\]/g, '').replace(/-\d{8}$/, '');
  if (PRICE_PER_MTOK[normalized]) return PRICE_PER_MTOK[normalized];
  for (const key of Object.keys(PRICE_PER_MTOK)) {
    if (normalized.startsWith(key)) return PRICE_PER_MTOK[key];
  }
  return null;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function emptyAggregate() {
  return {
    perModel: new Map(),
    tools: new Set(),
    mcpServers: new Set(),
    firstTs: null,
    lastTs: null,
    cwdFromTranscript: null,
    primaryModel: null,
  };
}

function bucketFor(agg, model) {
  const key = model || '_unknown';
  if (!agg.perModel.has(key)) {
    agg.perModel.set(key, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  }
  return agg.perModel.get(key);
}

function parseInto(agg, path, isPrimary) {
  if (!path || !existsSync(path)) return;
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    const ts = msg.timestamp ? Date.parse(msg.timestamp) : null;
    if (ts) {
      if (agg.firstTs === null || ts < agg.firstTs) agg.firstTs = ts;
      if (agg.lastTs === null || ts > agg.lastTs) agg.lastTs = ts;
    }

    if (!agg.cwdFromTranscript && typeof msg.cwd === 'string' && msg.cwd) {
      agg.cwdFromTranscript = msg.cwd;
    }

    const message = msg.message ?? msg;
    if (message?.role !== 'assistant') continue;

    const model = message.model || null;
    if (isPrimary && model) agg.primaryModel = model;

    const u = message.usage ?? {};
    const bucket = bucketFor(agg, model);
    bucket.input += u.input_tokens ?? 0;
    bucket.output += u.output_tokens ?? 0;
    bucket.cacheRead += u.cache_read_input_tokens ?? 0;
    bucket.cacheWrite += u.cache_creation_input_tokens ?? 0;

    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name) {
        const name = block.name;
        if (name.startsWith('mcp__')) {
          const parts = name.split('__');
          if (parts[1]) agg.mcpServers.add(parts[1]);
          agg.tools.add(name);
        } else {
          agg.tools.add(name);
        }
      }
    }
  }
}

function findSubagentTranscripts(primaryPath) {
  if (!primaryPath) return [];
  const sessionId = basename(primaryPath, '.jsonl');
  const subDir = join(dirname(primaryPath), sessionId, 'subagents');
  if (!existsSync(subDir)) return [];
  try {
    return readdirSync(subDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(subDir, f));
  } catch {
    return [];
  }
}

function buildAggregate(primaryPath) {
  if (!primaryPath || !existsSync(primaryPath)) return null;
  const agg = emptyAggregate();
  parseInto(agg, primaryPath, true);
  for (const sub of findSubagentTranscripts(primaryPath)) {
    parseInto(agg, sub, false);
  }
  return agg;
}

function totals(agg) {
  let input = 0, output = 0, cacheRead = 0, cacheWrite = 0;
  for (const b of agg.perModel.values()) {
    input += b.input;
    output += b.output;
    cacheRead += b.cacheRead;
    cacheWrite += b.cacheWrite;
  }
  return { input, output, cacheRead, cacheWrite };
}

function computeCost(agg) {
  let cost = 0;
  for (const [model, b] of agg.perModel.entries()) {
    const price = resolvePrice(model === '_unknown' ? agg.primaryModel : model);
    if (!price) continue;
    cost +=
      (b.input / 1_000_000) * price.in +
      (b.output / 1_000_000) * price.out +
      (b.cacheRead / 1_000_000) * price.cacheRead +
      (b.cacheWrite / 1_000_000) * price.cacheWrite;
  }
  return Math.round(cost * 10000) / 10000;
}

function commitsInWindow(cwd, firstTs, lastTs) {
  if (!firstTs || !lastTs) return [];
  const since = new Date(firstTs - 60_000).toISOString();
  const until = new Date(lastTs + 60_000).toISOString();
  const result = spawnSync(
    'git',
    ['log', `--since=${since}`, `--until=${until}`, '--pretty=format:%H', '--no-merges'],
    { cwd, encoding: 'utf-8', shell: process.platform === 'win32' },
  );
  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 50);
}

function main() {
  const raw = readStdin();
  let payload = {};
  try { payload = JSON.parse(raw); } catch (err) {
    log('warn', 'failed to parse SessionEnd payload', { error: String(err) });
  }

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) {
    log('warn', 'no transcript_path in payload — nothing to record');
    process.exit(0);
  }
  if (!existsSync(transcriptPath)) {
    log('warn', 'transcript_path does not exist', { transcriptPath });
    process.exit(0);
  }

  const agg = buildAggregate(transcriptPath);

  if (!agg) {
    log('warn', 'parser returned no aggregate', { transcriptPath });
    process.exit(0);
  }

  const t = totals(agg);
  const cwd = payload.cwd || agg.cwdFromTranscript || process.cwd();
  const cost = computeCost(agg);
  const durationSecs = agg.firstTs && agg.lastTs ? Math.max(1, Math.round((agg.lastTs - agg.firstTs) / 1000)) : null;
  const commits = commitsInWindow(cwd, agg.firstTs, agg.lastTs);

  const args = [
    'session', 'add',
    '--provider', 'anthropic',
    '--tool', 'claude-code',
    '--notes-from-today',
  ];
  if (agg.primaryModel) args.push('--model', agg.primaryModel);
  if (t.input > 0) args.push('--input-tokens', String(t.input));
  if (t.output > 0) args.push('--output-tokens', String(t.output));
  if (t.cacheRead > 0) args.push('--cache-read-tokens', String(t.cacheRead));
  if (t.cacheWrite > 0) args.push('--cache-write-tokens', String(t.cacheWrite));
  if (cost > 0) args.push('--cost', cost.toFixed(4));
  if (durationSecs) args.push('--duration', String(durationSecs));
  if (agg.tools.size > 0) args.push('--tools-used', [...agg.tools].join(','));
  if (agg.mcpServers.size > 0) args.push('--mcp-servers', [...agg.mcpServers].join(','));
  if (commits.length > 0) args.push('--commits', commits.join(','));

  if (process.env.WORKTALE_HOOK_DRY_RUN === '1') {
    const debug = {
      cwd,
      args,
      perModel: Object.fromEntries(agg.perModel),
      subagentCount: findSubagentTranscripts(transcriptPath).length,
    };
    console.log(JSON.stringify(debug));
    process.exit(0);
  }
  const result = spawnSync('worktale', args, {
    cwd,
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    log('error', 'worktale CLI failed to spawn', {
      error: String(result.error),
      hint: 'is `worktale` installed and on PATH? `npm install -g worktale`',
    });
    process.exit(0);
  }
  if ((result.status ?? 0) !== 0) {
    log('error', 'worktale CLI exited non-zero', {
      status: result.status,
      stdout: (result.stdout || '').trim().slice(0, 500),
      stderr: (result.stderr || '').trim().slice(0, 500),
      args,
    });
  } else {
    log('info', 'session recorded', {
      cost: cost.toFixed(4),
      input: t.input,
      output: t.output,
      cacheRead: t.cacheRead,
      cacheWrite: t.cacheWrite,
      durationSecs,
      subagentCount: findSubagentTranscripts(transcriptPath).length,
    });
  }
  process.exit(0);
}

main();
