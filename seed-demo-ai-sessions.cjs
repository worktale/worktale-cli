// Seed realistic AI sessions for the worktaleDemo project (repo_id = 10).
// Tied to actual NetProbe commit SHAs so the new commits-linked-to-sessions
// feature has data to show during the demo.
//
// Idempotent-ish: checks for an existing matching (date, note) pair before
// inserting, so re-running won't duplicate rows.
//
// Usage:  node seed-demo-ai-sessions.js
// Undo:   node seed-demo-ai-sessions.js --undo  (deletes only rows this script inserted, identified by note prefix)

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const DB_PATH = path.join(os.homedir(), '.worktale', 'data.db');
const REPO_ID = 10;
const NOTE_PREFIX = '[demo] ';  // marker for cleanup

// Seeded RNG for reproducibility
let _seed = 1337;
function rand() {
  _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
  return _seed / 0x7fffffff;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min, max) { return rand() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

// --- Realistic shape helpers ---------------------------------------------

function shape(model) {
  // returns {cost, inTokens, outTokens, duration}
  switch (model) {
    case 'claude-opus-4-6': {
      const cost = randFloat(1.5, 3.4);
      return { cost, inTokens: randInt(45000, 95000), outTokens: randInt(8000, 25000), duration: randInt(1200, 3600) };
    }
    case 'claude-sonnet-4-6': {
      const cost = randFloat(0.20, 0.85);
      return { cost, inTokens: randInt(15000, 75000), outTokens: randInt(5000, 30000), duration: randInt(700, 2400) };
    }
    case 'claude-sonnet-4-5': {
      const cost = randFloat(0.15, 0.55);
      return { cost, inTokens: randInt(10000, 50000), outTokens: randInt(4000, 22000), duration: randInt(600, 1800) };
    }
    case 'gpt-4o': {
      const cost = randFloat(0.20, 0.75);
      return { cost, inTokens: randInt(20000, 80000), outTokens: randInt(3000, 28000), duration: randInt(700, 2400) };
    }
    case 'o3': {
      const cost = randFloat(0.85, 1.95);
      return { cost, inTokens: randInt(25000, 70000), outTokens: randInt(6000, 30000), duration: randInt(1200, 3800) };
    }
    case 'gpt-5': {
      const cost = randFloat(0.40, 1.20);
      return { cost, inTokens: randInt(20000, 65000), outTokens: randInt(5000, 25000), duration: randInt(900, 2700) };
    }
    default:
      return { cost: 0.30, inTokens: 20000, outTokens: 8000, duration: 1200 };
  }
}

function toolsFor(tool) {
  if (tool === 'claude-code') {
    const all = ['Read', 'Edit', 'Bash', 'Grep', 'Glob', 'Write', 'Agent', 'WebSearch', 'WebFetch', 'TodoWrite'];
    const n = randInt(3, 6);
    return shuffle(all).slice(0, n);
  }
  if (tool === 'codex') {
    return shuffle(['shell', 'read', 'write', 'edit', 'search', 'apply_patch']).slice(0, randInt(3, 5));
  }
  if (tool === 'copilot') {
    return shuffle(['readFile', 'editFile', 'runInTerminal', 'searchWorkspace', 'fetchUrl']).slice(0, randInt(3, 5));
  }
  return [];
}
function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function maybeMcps(prob = 0.35) {
  if (rand() > prob) return null;
  const all = ['github', 'slack', 'linear', 'sentry', 'context7'];
  const n = randInt(1, 2);
  return shuffle(all).slice(0, n);
}

// --- Session data ---------------------------------------------------------

const sessions = [
  // ===== EARLY DEV (Jan 2026) =====
  {
    date: '2026-01-05', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Scaffolded NetProbe console project — solution file, namespace config, REPL skeleton',
    shas: ['5fcff20', '350d2a4', 'bd1cb58', 'a45f689', '9e6b9e7'],
  },
  {
    date: '2026-01-06', tool: 'copilot', provider: 'github', model: 'gpt-4o',
    note: 'Built REPL input loop with help command and styled prompt + goodbye message',
    shas: ['b866b99', '05bfd49', '9e34c44'],
  },
  {
    date: '2026-01-07', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Designed PingResult model — IP address, TTL, and error fields for ICMP responses',
    shas: ['4e3b60e', '40051a0'],
  },
  {
    date: '2026-01-08', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-5',
    note: 'Implemented async ICMP PingService and wired into REPL with IPStatus error mapping',
    shas: ['1a82b1d', '460188d', '2ac39a2'],
  },
  {
    date: '2026-01-11', tool: 'codex', provider: 'openai', model: 'o3',
    note: 'Refined ping handler — multi-ping with count/delay, statistics summary, formatting',
    shas: ['2c7f745', 'e5c2a59', '933dff3', '1dd0257'],
  },
  {
    date: '2026-01-12', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Built DnsResult model and DnsService with forward + reverse resolution and aliases',
    shas: ['313e7cc', 'e922e6e', '084b461', '13206bd'],
  },
  {
    date: '2026-01-16', tool: 'claude-code', provider: 'anthropic', model: 'claude-opus-4-6',
    note: 'Implemented PortScanService — single-port TCP scan + parallel common ports check',
    shas: ['38fa5ae', 'c024aa0', '677a1e9', 'e53515e', '4622e6e'],
  },
  {
    date: '2026-01-19', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Built TracerouteService with TTL-increment loop and reverse DNS for each hop',
    shas: ['0e36f53', 'ffdd8f4', '1e51812', '0ceb5e8'],
  },
  {
    date: '2026-01-23', tool: 'codex', provider: 'openai', model: 'gpt-4o',
    note: 'Added NetworkInfoService — interface enumeration with DNS, gateway, MAC fields',
    shas: ['76114eb', '33083ed', 'eaea24a', '8b857c9', 'e4582ea'],
  },
  {
    date: '2026-01-27', tool: 'claude-code', provider: 'anthropic', model: 'claude-opus-4-6',
    note: 'Built WhoisService over raw TCP WHOIS protocol with parsed registrar/dates/nameservers',
    shas: ['94a8df6', '3c838ad', 'f973c26'],
  },
  {
    date: '2026-01-29', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Implemented HttpCheckService — response headers, SSL info, server detection',
    shas: ['8d03f59', 'e95532f', '5bbeeae'],
  },
  {
    date: '2026-01-31', tool: 'copilot', provider: 'github', model: 'gpt-4o',
    note: 'Wired WHOIS and HTTP commands into CLI with display formatters',
    shas: ['8890199', '91b527d'],
  },

  // ===== Feb 2026 =====
  {
    date: '2026-02-01', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Integrated Spectre.Console for tables and refreshed README feature list',
    shas: ['9de4499', 'e3b7721'],
  },
  {
    date: '2026-02-03', tool: 'codex', provider: 'openai', model: 'o3',
    note: 'Built NetstatService with cross-platform process output parsing and state aggregation',
    shas: ['250300', 'e62c2c3', 'f3ab70e', '1ce1b92'],
  },
  {
    date: '2026-02-05', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-5',
    note: 'Implemented ArpService with ARP-table parsing and ArpEntry model',
    shas: ['eb2e2d4', '8809006'],
  },
  {
    date: '2026-02-06', tool: 'claude-code', provider: 'anthropic', model: 'claude-opus-4-6',
    note: 'Built BandwidthService download speed test with computed-speed property and formatter',
    shas: ['53cfa17', '633a5f1', 'dfe355a'],
  },
  {
    date: '2026-02-12', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Implemented GeoIpService against ip-api.com with GeoIpResult model',
    shas: ['b16bc4d', 'd20a1c2'],
  },
  {
    date: '2026-02-13', tool: 'codex', provider: 'openai', model: 'gpt-4o',
    note: 'Built SslCheckService with TLS handshake and SslCertInfo certificate inspection',
    shas: ['8b11b8d', 'aa81da3'],
  },
  {
    date: '2026-02-14', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Added ConnectionLog session history with HistoryHelper formatted display',
    shas: ['4fad606', 'e9cac33'],
  },
  {
    date: '2026-02-19', tool: 'copilot', provider: 'github', model: 'gpt-4o',
    note: 'Rewrote README with feature comparison table and added MIT license',
    shas: ['de37b71', '1682564'],
  },
  {
    date: '2026-02-26', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Extracted magic numbers into Constants and added FormatHelper for sizes/durations',
    shas: ['48e472f', '18ca5c0', 'c4f5b03', 'ef2409d'],
  },

  // ===== Mar 2026 (early — before existing sessions kick in on 3-17) =====
  {
    date: '2026-03-09', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Hardened DNS lookup error handling for IPv6 and added ping input validation',
    shas: ['9bd099a', 'd12349b'],
  },
  {
    date: '2026-03-13', tool: 'codex', provider: 'openai', model: 'gpt-4o',
    note: 'Added retry logic to GeoIP lookups on transient failures + JSON export helper',
    shas: ['9d881b1', '3d0a0ed', '60d1791'],
  },

  // ===== Late April 2026 (after existing sessions stop on 4-15 — RECENT WORK) =====
  {
    date: '2026-04-16', tool: 'claude-code', provider: 'anthropic', model: 'claude-opus-4-6',
    note: 'Built health check suite with HTTP/ping/TCP probes plus proxy & redirect detection — landed v1.2.0',
    shas: ['8e78e01', '62ad96c', '8c688eb', 'd9bb396', '5545a57', '95cf295', 'e6e1e3f', 'be5987a'],
    mcps: ['github', 'linear'],
  },
  {
    date: '2026-04-17', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Began IPv6 dual-stack support — AddressFamily on PingResult, fallback constants, host formatter stub',
    shas: ['46f9a23', 'c1e284b', '082b066', '30b3d47'],
  },
  {
    date: '2026-04-18', tool: 'codex', provider: 'openai', model: 'o3',
    note: 'IPv6 polish — bracketed literal rendering in console tables and double-bracket fix',
    shas: ['699af57', '8f943a1', 'f4037f7'],
  },
  {
    date: '2026-04-20', tool: 'claude-code', provider: 'anthropic', model: 'claude-opus-4-6',
    note: 'Connection log overhaul — Direction + CorrelationId fields, 5MB rotation, dedup, fsync on rotation',
    shas: ['64aae6b', 'ef42ad8', 'f37aa46', 'c076e0f', '24a1680'],
    mcps: ['github'],
  },
  {
    date: '2026-04-21', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'DoH/DoT awareness on DNS — Transport field, default DoH endpoints, per-result resolver tracking',
    shas: ['b9d5d9c', 'f0cccc3', '2b479ba', '4ab0326'],
  },
  {
    date: '2026-04-22', tool: 'codex', provider: 'openai', model: 'o3',
    note: 'BatchRunner backpressure rewrite — bounded Channel<T>, parallelism tuning, 30s backoff cap, streamed CSV exports',
    shas: ['17be3ec', 'c171d79', '18ac1b5', '9d8a5a0'],
    mcps: ['github', 'sentry'],
  },
  {
    date: '2026-04-23', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Hardening sweep — non-en-US locale parse, redirect cap, banner CRLF strip, exception inner preservation',
    shas: ['f60984e', '051069b', 'b4e07c4', '051b1ef'],
  },
  {
    date: '2026-04-24', tool: 'claude-code', provider: 'anthropic', model: 'claude-sonnet-4-6',
    note: 'Health check polish — backpressure docs in ARCHITECTURE.md, ConsecutiveFailures counter, CONTRIBUTING update',
    shas: ['63b0acf', 'a1b26a4', '5a7e89a'],
  },
  {
    date: '2026-04-25', tool: 'copilot', provider: 'github', model: 'gpt-4o',
    note: 'Exposed HealthCheck.AlertAfterFailures in AppConfig for user-tunable failure thresholds',
    shas: ['dc706a0'],
  },
  {
    date: '2026-04-26', tool: 'claude-code', provider: 'anthropic', model: 'claude-opus-4-6',
    note: 'Cut 1.3.0 release — drafted CHANGELOG entry, version bump, refreshed README feature list',
    shas: ['3d255c8', '174aef4', '5a018bb'],
    mcps: ['github', 'slack'],
  },
];

// --- Insert ---------------------------------------------------------------

function main() {
  const undo = process.argv.includes('--undo');
  const db = new Database(DB_PATH);

  if (undo) {
    const result = db.prepare(
      `DELETE FROM ai_sessions WHERE repo_id = ? AND note LIKE ?`
    ).run(REPO_ID, NOTE_PREFIX + '%');
    console.log(`Removed ${result.changes} demo rows.`);
    db.close();
    return;
  }

  const insert = db.prepare(`
    INSERT INTO ai_sessions
      (repo_id, date, provider, model, tool, cost_usd, input_tokens, output_tokens,
       tools_used, mcp_servers, duration_secs, commits, note, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const exists = db.prepare(
    `SELECT 1 FROM ai_sessions WHERE repo_id = ? AND date = ? AND note = ? LIMIT 1`
  );

  let inserted = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const s of sessions) {
      const taggedNote = NOTE_PREFIX + s.note;
      if (exists.get(REPO_ID, s.date, taggedNote)) { skipped++; continue; }

      const sh = shape(s.model);
      const tools = toolsFor(s.tool);
      const mcps = s.mcps ?? maybeMcps();

      // Timestamp: noon-ish on the session date with a deterministic-ish offset
      const hour = randInt(9, 18);
      const minute = randInt(0, 59);
      const ts = `${s.date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

      insert.run(
        REPO_ID,
        s.date,
        s.provider,
        s.model,
        s.tool,
        Number(sh.cost.toFixed(4)),
        sh.inTokens,
        sh.outTokens,
        JSON.stringify(tools),
        mcps ? JSON.stringify(mcps) : null,
        sh.duration,
        JSON.stringify(s.shas),
        taggedNote,
        ts,
      );
      inserted++;
    }
  });
  tx();

  console.log(`Inserted ${inserted} demo AI sessions for repo ${REPO_ID} (skipped ${skipped} existing).`);
  db.close();
}

main();
