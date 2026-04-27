#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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

function parseTranscript(path) {
  if (!path || !existsSync(path)) return null;
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());

  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let model = null;
  const tools = new Set();
  const mcpServers = new Set();
  let firstTs = null;
  let lastTs = null;

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    const ts = msg.timestamp ? Date.parse(msg.timestamp) : null;
    if (ts) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }

    const message = msg.message ?? msg;
    if (message?.role === 'assistant') {
      if (message.model) model = message.model;
      const u = message.usage ?? {};
      inputTokens += u.input_tokens ?? 0;
      outputTokens += u.output_tokens ?? 0;
      cacheReadTokens += u.cache_read_input_tokens ?? 0;
      cacheWriteTokens += u.cache_creation_input_tokens ?? 0;

      const content = Array.isArray(message.content) ? message.content : [];
      for (const block of content) {
        if (block?.type === 'tool_use' && block.name) {
          const name = block.name;
          if (name.startsWith('mcp__')) {
            const parts = name.split('__');
            if (parts[1]) mcpServers.add(parts[1]);
            tools.add(name);
          } else {
            tools.add(name);
          }
        }
      }
    }
  }

  const durationSecs = firstTs && lastTs ? Math.max(1, Math.round((lastTs - firstTs) / 1000)) : null;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    model,
    tools: [...tools],
    mcpServers: [...mcpServers],
    durationSecs,
  };
}

function computeCost(t) {
  const price = resolvePrice(t.model);
  if (!price) return 0;
  const cost =
    (t.inputTokens / 1_000_000) * price.in +
    (t.outputTokens / 1_000_000) * price.out +
    (t.cacheReadTokens / 1_000_000) * price.cacheRead +
    (t.cacheWriteTokens / 1_000_000) * price.cacheWrite;
  return Math.round(cost * 10000) / 10000;
}

function main() {
  const raw = readStdin();
  let payload = {};
  try { payload = JSON.parse(raw); } catch { /* ignore */ }

  const transcriptPath = payload.transcript_path;
  const cwd = payload.cwd || process.cwd();
  const parsed = parseTranscript(transcriptPath);

  if (!parsed) {
    process.exit(0);
  }

  const cost = computeCost(parsed);

  const args = [
    'session', 'add',
    '--provider', 'anthropic',
    '--tool', 'claude-code',
  ];
  if (parsed.model) args.push('--model', parsed.model);
  if (parsed.inputTokens > 0) args.push('--input-tokens', String(parsed.inputTokens));
  if (parsed.outputTokens > 0) args.push('--output-tokens', String(parsed.outputTokens));
  if (parsed.cacheReadTokens > 0) args.push('--cache-read-tokens', String(parsed.cacheReadTokens));
  if (parsed.cacheWriteTokens > 0) args.push('--cache-write-tokens', String(parsed.cacheWriteTokens));
  if (cost > 0) args.push('--cost', cost.toFixed(4));
  if (parsed.durationSecs) args.push('--duration', String(parsed.durationSecs));
  if (parsed.tools.length > 0) args.push('--tools-used', parsed.tools.join(','));
  if (parsed.mcpServers.length > 0) args.push('--mcp-servers', parsed.mcpServers.join(','));

  if (process.env.WORKTALE_HOOK_DRY_RUN === '1') {
    console.log(JSON.stringify({ cwd, args }));
    process.exit(0);
  }
  const result = spawnSync('worktale', args, { cwd, stdio: 'ignore', shell: process.platform === 'win32' });
  process.exit(result.status ?? 0);
}

main();
