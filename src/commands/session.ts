import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { brandText, dimText, positiveText, streakText, negativeText } from '../tui/theme.js';
import { getRepo, addRepo } from '../db/repos.js';
import { closeDb } from '../db/index.js';
import { insertAiSession, getAiSessionsByDate, getAiSessionStats } from '../db/ai-sessions.js';
import { formatNumber, formatDuration, getDateString } from '../utils/formatting.js';

interface SessionOptions {
  provider?: string;
  model?: string;
  tool?: string;
  cost?: string;
  inputTokens?: string;
  outputTokens?: string;
  toolsUsed?: string;
  mcpServers?: string;
  duration?: string;
  commits?: string;
  note?: string;
  format?: string;
  days?: string;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export async function sessionCommand(
  action?: string,
  options: SessionOptions = {},
): Promise<void> {
  try {
    switch (action) {
      case 'add':
        await addSession(options);
        break;
      case 'list':
        await listSessions(options);
        break;
      case 'stats':
        await showStats(options);
        break;
      default:
        // If flags are present but no action, treat as "add"
        if (options.provider || options.model || options.tool || options.note) {
          await addSession(options);
        } else {
          showHelp();
        }
        break;
    }
    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}

async function addSession(options: SessionOptions): Promise<void> {
  const repoPath = process.cwd();

  // Auto-register repo if not tracked
  let repo = getRepo(repoPath);
  if (!repo && existsSync(join(repoPath, '.git'))) {
    const name = basename(repoPath);
    addRepo(repoPath, name);
    repo = getRepo(repoPath);
  }

  if (!repo) {
    console.log('  ' + dimText('Not a tracked git repository. Run') + ' ' + brandText('worktale init'));
    return;
  }

  const today = getDateString();

  const sessionId = insertAiSession({
    repo_id: repo.id,
    date: today,
    provider: options.provider,
    model: options.model,
    tool: options.tool,
    cost_usd: options.cost ? parseFloat(options.cost) : undefined,
    input_tokens: options.inputTokens ? parseInt(options.inputTokens, 10) : undefined,
    output_tokens: options.outputTokens ? parseInt(options.outputTokens, 10) : undefined,
    tools_used: options.toolsUsed ? options.toolsUsed.split(',').map((t) => t.trim()) : undefined,
    mcp_servers: options.mcpServers ? options.mcpServers.split(',').map((s) => s.trim()) : undefined,
    duration_secs: options.duration ? parseInt(options.duration, 10) : undefined,
    commits: options.commits ? options.commits.split(',').map((s) => s.trim()) : undefined,
    note: options.note,
  });

  // Compact output for agent consumption
  const parts: string[] = [];
  if (options.tool) parts.push(options.tool);
  if (options.model) parts.push(options.model);
  if (options.cost) parts.push(`$${options.cost}`);

  console.log('  ' + positiveText('\u2713') + '  AI session recorded' + (parts.length > 0 ? ` (${parts.join(' \u00B7 ')})` : ''));
}

async function listSessions(options: SessionOptions): Promise<void> {
  const repoPath = process.cwd();
  const repo = getRepo(repoPath);
  if (!repo) {
    if (options.format === 'json') console.log('[]');
    else if (options.format === 'csv') console.log('');
    else console.log('  ' + dimText('Not a tracked repo.'));
    return;
  }

  const today = getDateString();
  const daysRaw = options.days ?? options.duration;
  const days = daysRaw ? parseInt(daysRaw, 10) : 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = getDateString(since);

  const { getAiSessionsRange } = await import('../db/ai-sessions.js');
  const sessions = getAiSessionsRange(repo.id, sinceStr, today);

  if (options.format === 'json') {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  if (options.format === 'csv') {
    const headers = ['date', 'tool', 'provider', 'model', 'input_tokens', 'output_tokens', 'cost_usd', 'duration_secs', 'tools_used', 'mcp_servers', 'commits', 'note'];
    console.log(headers.join(','));
    for (const s of sessions) {
      console.log([
        s.date,
        s.tool ?? '',
        s.provider ?? '',
        s.model ?? '',
        s.input_tokens,
        s.output_tokens,
        s.cost_usd,
        s.duration_secs,
        Array.isArray(s.tools_used) ? s.tools_used.join('|') : '',
        Array.isArray(s.mcp_servers) ? s.mcp_servers.join('|') : '',
        Array.isArray(s.commits) ? s.commits.join('|') : '',
        s.note ?? '',
      ].map(csvEscape).join(','));
    }
    return;
  }

  console.log('');
  console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('AI Sessions') + '  ' + dimText(`(last ${days} days)`));
  console.log('  ' + dimText('\u2500'.repeat(60)));
  console.log('');

  if (sessions.length === 0) {
    console.log('  ' + dimText('No AI sessions recorded.'));
    console.log('');
    return;
  }

  let currentDate = '';
  for (const s of sessions) {
    if (s.date !== currentDate) {
      currentDate = s.date;
      console.log('  ' + chalk.bold(s.date));
    }

    const tool = s.tool ?? 'unknown';
    const model = s.model ?? '';
    const cost = s.cost_usd > 0 ? chalk.yellow(`$${s.cost_usd.toFixed(4)}`) : '';
    const tokens = (s.input_tokens + s.output_tokens) > 0
      ? dimText(`${formatNumber(s.input_tokens + s.output_tokens)} tokens`)
      : '';
    const dur = s.duration_secs > 0 ? dimText(formatDuration(Math.round(s.duration_secs / 60))) : '';

    console.log(
      '    ' + brandText(tool.padEnd(14)) +
      dimText(model.padEnd(22)) +
      (cost ? cost.padEnd(16) : ''.padEnd(6)) +
      tokens.padEnd(18) +
      dur,
    );

    if (s.note) {
      console.log('    ' + dimText('  \u2514 ') + s.note);
    }
  }

  console.log('');
}

async function showStats(options: SessionOptions): Promise<void> {
  const repoPath = process.cwd();
  const repo = getRepo(repoPath);
  if (!repo) {
    if (options.format === 'json') console.log('{}');
    else if (options.format === 'csv') console.log('');
    else console.log('  ' + dimText('Not a tracked repo.'));
    return;
  }

  const daysRaw = options.days ?? options.duration;
  const days = daysRaw ? parseInt(daysRaw, 10) : 30;
  const stats = getAiSessionStats(repo.id, days);

  if (options.format === 'json') {
    console.log(JSON.stringify({ days, ...stats }, null, 2));
    return;
  }
  if (options.format === 'csv') {
    // Emit a "summary" row then expanded sections
    console.log('metric,value');
    console.log(`days,${days}`);
    console.log(`total_sessions,${stats.total_sessions}`);
    console.log(`total_cost_usd,${stats.total_cost.toFixed(4)}`);
    console.log(`total_input_tokens,${stats.total_input_tokens}`);
    console.log(`total_output_tokens,${stats.total_output_tokens}`);
    console.log(`total_duration_secs,${stats.total_duration_secs}`);
    console.log('');
    console.log('category,key,count');
    for (const [k, v] of Object.entries(stats.tools ?? {})) console.log(`tool,${csvEscape(k)},${v}`);
    for (const [k, v] of Object.entries(stats.models ?? {})) console.log(`model,${csvEscape(k)},${v}`);
    for (const [k, v] of Object.entries(stats.providers ?? {})) console.log(`provider,${csvEscape(k)},${v}`);
    for (const [k, v] of Object.entries(stats.tools_used_frequency ?? {})) console.log(`tools_used,${csvEscape(k)},${v}`);
    for (const [k, v] of Object.entries(stats.mcp_servers_used ?? {})) console.log(`mcp_server,${csvEscape(k)},${v}`);
    return;
  }

  console.log('');
  console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('AI Usage Stats') + '  ' + dimText(`(last ${days} days)`));
  console.log('  ' + dimText('\u2500'.repeat(50)));
  console.log('');

  if (stats.total_sessions === 0) {
    console.log('  ' + dimText('No AI sessions recorded.'));
    console.log('');
    return;
  }

  console.log('  ' + dimText('Sessions:') + '       ' + chalk.bold(String(stats.total_sessions)));
  console.log('  ' + dimText('Total Cost:') + '     ' + streakText(`$${stats.total_cost.toFixed(4)}`));
  console.log('  ' + dimText('Input Tokens:') + '   ' + formatNumber(stats.total_input_tokens));
  console.log('  ' + dimText('Output Tokens:') + '  ' + formatNumber(stats.total_output_tokens));
  console.log('  ' + dimText('Total Time:') + '     ' + formatDuration(Math.round(stats.total_duration_secs / 60)));
  console.log('');

  if (Object.keys(stats.tools).length > 0) {
    console.log('  ' + chalk.bold('Tools:'));
    for (const [tool, count] of Object.entries(stats.tools).sort((a, b) => b[1] - a[1])) {
      console.log('    ' + brandText(tool.padEnd(16)) + dimText(`${count} sessions`));
    }
    console.log('');
  }

  if (Object.keys(stats.models).length > 0) {
    console.log('  ' + chalk.bold('Models:'));
    for (const [model, count] of Object.entries(stats.models).sort((a, b) => b[1] - a[1])) {
      console.log('    ' + dimText(model.padEnd(28)) + dimText(`${count}x`));
    }
    console.log('');
  }

  if (Object.keys(stats.tools_used_frequency).length > 0) {
    console.log('  ' + chalk.bold('Agent Tools:'));
    const sorted = Object.entries(stats.tools_used_frequency).sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [t, count] of sorted) {
      console.log('    ' + dimText(t.padEnd(20)) + dimText(`${count}x`));
    }
    console.log('');
  }

  if (Object.keys(stats.mcp_servers_used).length > 0) {
    console.log('  ' + chalk.bold('MCP Servers:'));
    for (const [srv, count] of Object.entries(stats.mcp_servers_used).sort((a, b) => b[1] - a[1])) {
      console.log('    ' + dimText(srv.padEnd(20)) + dimText(`${count}x`));
    }
    console.log('');
  }

  if (Object.keys(stats.providers).length > 0) {
    console.log('  ' + chalk.bold('Providers:'));
    for (const [prov, count] of Object.entries(stats.providers).sort((a, b) => b[1] - a[1])) {
      console.log('    ' + dimText(prov.padEnd(16)) + dimText(`${count} sessions`));
    }
    console.log('');
  }
}

function showHelp(): void {
  console.log('');
  console.log('  ' + brandText('worktale session') + ' \u2014 Track AI coding sessions');
  console.log('');
  console.log('  ' + dimText('Usage:'));
  console.log('    worktale session add [options]       ' + dimText('Record an AI session'));
  console.log('    worktale session list [-d days]      ' + dimText('List recent sessions'));
  console.log('    worktale session stats [-d days]     ' + dimText('Show AI usage statistics'));
  console.log('');
  console.log('  ' + dimText('Options (for add):'));
  console.log('    --provider <name>       ' + dimText('AI provider (anthropic, openai, github)'));
  console.log('    --model <name>          ' + dimText('Model (claude-opus-4-6, gpt-4o, o3)'));
  console.log('    --tool <name>           ' + dimText('Tool (claude-code, codex, copilot)'));
  console.log('    --cost <usd>            ' + dimText('Session cost in USD'));
  console.log('    --input-tokens <n>      ' + dimText('Input token count'));
  console.log('    --output-tokens <n>     ' + dimText('Output token count'));
  console.log('    --tools-used <list>     ' + dimText('Comma-separated agent tools'));
  console.log('    --mcp-servers <list>    ' + dimText('Comma-separated MCP servers'));
  console.log('    --duration <secs>       ' + dimText('Session duration in seconds'));
  console.log('    --commits <shas>        ' + dimText('Comma-separated commit SHAs'));
  console.log('    --note <text>           ' + dimText('Session note'));
  console.log('');
}
