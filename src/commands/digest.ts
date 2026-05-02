import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { getRepo, getAllRepos } from '../db/repos.js';
import type { Repo } from '../db/repos.js';
import { getCommitsByDate, getCommitsByDateRange, getRecentCommits } from '../db/commits.js';
import type { Commit } from '../db/commits.js';
import { getDailySummary, updateUserNotes, getDailySummariesRange } from '../db/daily-summaries.js';
import { getModuleActivityByDate, getTopModules } from '../db/file-activity.js';
import { loadConfig } from '../config/index.js';
import { closeDb } from '../db/index.js';
import { formatDate, getDateString } from '../utils/formatting.js';
import { brandText, positiveText, dimText, streakText } from '../tui/theme.js';
import {
  generateTemplateDigest,
  generateConsolidatedDigest,
  generateWithOllama,
  buildOllamaPrompt,
  buildOllamaPromptPerRepo,
  capPerRepoCommits,
  type ConsolidatedDigestInput,
  type ConsolidatedRepoSection,
} from '../utils/digest-generator.js';
import { showCatchupBanner } from '../utils/catchup-banner.js';
import { getAiSessionsByDate, getAiSessionsRange } from '../db/ai-sessions.js';
import type { AiSessionDigestData } from '../utils/digest-generator.js';
import {
  getCombinedAiSessionStats,
  getCombinedTopModules,
  getGlobalFirstCommitDate,
  getPerRepoDailySummaryRange,
  getAggregatedDailySummary,
} from '../db/aggregates.js';

interface DigestOptions {
  format?: string;
  allRepos?: boolean;
  since?: string;
  days?: string;
  allTime?: boolean;
  perRepo?: boolean;
  repos?: string;
}

function promptYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === '' || trimmed === 'y' || trimmed === 'yes');
    });
  });
}

function isAllReposMode(options: DigestOptions): boolean {
  return Boolean(options.allRepos || options.since || options.days || options.allTime || options.repos);
}

function resolveRange(options: DigestOptions): { start: string; end: string; label: string; isMultiDay: boolean } {
  const today = getDateString();

  if (options.allTime) {
    const first = getGlobalFirstCommitDate() ?? today;
    return {
      start: first,
      end: today,
      label: `All-time (${first} — ${today})`,
      isMultiDay: first !== today,
    };
  }

  if (options.since) {
    return {
      start: options.since,
      end: today,
      label: `${options.since} — ${today}`,
      isMultiDay: options.since !== today,
    };
  }

  if (options.days) {
    const n = Math.max(1, parseInt(options.days, 10) || 1);
    const start = new Date();
    start.setDate(start.getDate() - (n - 1));
    const startStr = getDateString(start);
    return {
      start: startStr,
      end: today,
      label: `Last ${n} day${n !== 1 ? 's' : ''} (${startStr} — ${today})`,
      isMultiDay: n > 1,
    };
  }

  return { start: today, end: today, label: formatDate(today), isMultiDay: false };
}

function pickRepos(filter: string | undefined): Repo[] {
  const all = getAllRepos();
  if (!filter) return all;
  const wanted = new Set(filter.split(',').map((s) => s.trim()).filter(Boolean));
  return all.filter((r) => wanted.has(r.name));
}

async function buildAiDataForRange(start: string, end: string): Promise<AiSessionDigestData & { per_repo: Array<{ repo_name: string; sessions: number; cost: number; tokens: number }> } | undefined> {
  // days span = end - start + 1
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const stats = getCombinedAiSessionStats(days);
  if (stats.total_sessions === 0) return undefined;
  return {
    total_sessions: stats.total_sessions,
    total_cost: stats.total_cost,
    total_tokens: stats.total_input_tokens + stats.total_output_tokens,
    tools: Object.keys(stats.tools),
    models: Object.keys(stats.models),
    providers: Object.keys(stats.providers),
    per_repo: stats.per_repo,
  };
}

async function runConsolidatedDigest(options: DigestOptions): Promise<void> {
  const format = options.format || 'text';
  const isJson = format === 'json';
  const isMarkdown = format === 'markdown' || format === 'md';

  const range = resolveRange(options);
  const repos = pickRepos(options.repos);

  if (repos.length === 0) {
    if (isJson) {
      console.log(JSON.stringify({ error: 'no-repos', message: 'No repos tracked. Run `worktale init` in a repo first.' }));
    } else {
      console.log('');
      console.log('  ' + dimText('worktale:') + ' no tracked repos found.');
      console.log('  Run ' + brandText('worktale init') + ' in any project to start tracking.');
      console.log('');
    }
    closeDb();
    process.exit(0);
    return;
  }

  // Build per-repo sections by collecting commits + summary for each repo within the range
  const perRepo: ConsolidatedRepoSection[] = [];
  const repoIds = new Set(repos.map((r) => r.id));

  // Get per-repo daily summaries within range (joined with repo_name)
  const allSummaries = getPerRepoDailySummaryRange(range.start, range.end);
  const summariesByRepo = new Map<number, { commits_count: number; lines_added: number; lines_removed: number; files_touched: number }>();
  for (const s of allSummaries) {
    if (!repoIds.has(s.repo_id)) continue;
    const cur = summariesByRepo.get(s.repo_id) ?? { commits_count: 0, lines_added: 0, lines_removed: 0, files_touched: 0 };
    cur.commits_count += s.commits_count;
    cur.lines_added += s.lines_added;
    cur.lines_removed += s.lines_removed;
    cur.files_touched += s.files_touched;
    summariesByRepo.set(s.repo_id, cur);
  }

  for (const repo of repos) {
    const repoCommits: Commit[] = range.isMultiDay
      ? getCommitsByDateRange(repo.id, range.start, range.end)
      : getCommitsByDate(repo.id, range.start);
    if (repoCommits.length === 0) continue;

    const summary = summariesByRepo.get(repo.id) ?? {
      commits_count: repoCommits.length,
      lines_added: repoCommits.reduce((s, c) => s + c.lines_added, 0),
      lines_removed: repoCommits.reduce((s, c) => s + c.lines_removed, 0),
      files_touched: repoCommits.reduce((s, c) => s + c.files_changed, 0),
    };

    // Cap commits when range is multi-day
    let truncated_from: number | undefined;
    let displayCommits = repoCommits;
    if (range.isMultiDay) {
      // Sort desc to keep most recent
      const desc = [...repoCommits].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const capped = capPerRepoCommits(desc);
      displayCommits = capped.commits;
      truncated_from = capped.truncated_from;
    }

    perRepo.push({
      repo_name: repo.name,
      commits: displayCommits.map((c) => ({ message: c.message, sha: c.sha, timestamp: c.timestamp })),
      summary,
      truncated_from,
    });
  }

  // Sort per-repo by commit count desc
  perRepo.sort((a, b) => b.summary.commits_count - a.summary.commits_count || a.repo_name.localeCompare(b.repo_name));

  // Totals
  const totals = perRepo.reduce(
    (acc, r) => ({
      commits_count: acc.commits_count + r.summary.commits_count,
      lines_added: acc.lines_added + r.summary.lines_added,
      lines_removed: acc.lines_removed + r.summary.lines_removed,
      files_touched: acc.files_touched + r.summary.files_touched,
      repo_count: acc.repo_count + 1,
    }),
    { commits_count: 0, lines_added: 0, lines_removed: 0, files_touched: 0, repo_count: 0 },
  );

  // Top modules
  const moduleDays = range.isMultiDay
    ? Math.max(
        1,
        Math.round((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86_400_000) + 1,
      )
    : undefined;
  const topModules = getCombinedTopModules(8, moduleDays);

  // AI data
  const aiData = await buildAiDataForRange(range.start, range.end);

  // JSON output: emit raw structured payload and exit
  if (isJson) {
    console.log(JSON.stringify({
      mode: 'all-repos',
      range,
      totals,
      per_repo: perRepo.map((r) => ({
        repo: r.repo_name,
        summary: r.summary,
        commits: r.commits,
        truncated_from: r.truncated_from ?? null,
      })),
      modules: topModules,
      ai: aiData ?? null,
    }, null, 2));
    closeDb();
    process.exit(0);
    return;
  }

  // Optional Ollama enrichment per repo
  const config = loadConfig();
  const aiProvider = config.ai.provider;
  let perRepoDrafts: Map<string, string> | undefined;

  if (!isJson && !isMarkdown && aiProvider === 'ollama' && config.ai.model && totals.commits_count > 0) {
    const ollamaUrl = config.ai.ollamaUrl || 'http://localhost:11434';
    const model = config.ai.model;
    console.log('');
    console.log('  ' + dimText('Using Ollama (' + model + ') per repo...'));

    try {
      const checkResponse = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!checkResponse.ok) throw new Error('Ollama unreachable');

      perRepoDrafts = new Map();
      const results = await Promise.allSettled(
        perRepo.map(async (section) => {
          const prompt = buildOllamaPromptPerRepo(section.repo_name, section.commits, section.summary);
          const text = await generateWithOllama(prompt, model, ollamaUrl);
          return [section.repo_name, text] as const;
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') perRepoDrafts.set(r.value[0], r.value[1]);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log('  ' + chalk.yellow('⚠') + '  ' + chalk.yellow('Ollama not available: ' + errMsg));
      console.log('  ' + dimText('Falling back to template mode...'));
      perRepoDrafts = undefined;
    }
  }

  if (totals.commits_count === 0) {
    if (isMarkdown) {
      console.log(`# Worktale digest — ${range.label}\n\n_No commits in this period._`);
    } else {
      console.log('');
      console.log('  ' + dimText('No commits across tracked repos in this period.'));
      console.log('');
    }
    closeDb();
    process.exit(0);
    return;
  }

  const input: ConsolidatedDigestInput = {
    range_label: range.label,
    totals,
    per_repo: perRepo,
    modules: topModules.map((m) => ({ repo_name: m.repo_name, module: m.module, percentage: m.percentage })),
    ai: aiData,
    per_repo_drafts: perRepoDrafts,
  };

  const digest = generateConsolidatedDigest(input);

  if (!isMarkdown) {
    console.log('');
    console.log('  ' + streakText('⚡') + ' ' + chalk.bold('WORKTALE DIGEST') + ' ' + dimText('— ' + range.label));
    console.log('');
    console.log('  ' + dimText('─'.repeat(50)));
    console.log('');
  }

  if (isMarkdown) {
    console.log(digest);
  } else {
    const lines = digest.split('\n');
    for (const line of lines) {
      if (line.startsWith('## ')) {
        console.log('  ' + chalk.bold(line.slice(3)));
      } else if (line.startsWith('### ')) {
        console.log('  ' + brandText(line.slice(4)));
      } else if (line.startsWith('- ')) {
        console.log('  ' + dimText('•') + ' ' + line.slice(2));
      } else {
        console.log('  ' + line);
      }
    }
    console.log('');
    console.log('  ' + dimText('─'.repeat(50)));
    console.log('');
  }

  // Don't prompt to save in all-repos mode (notes are per-repo).
  closeDb();
  process.exit(0);
}

export async function digestCommand(options: DigestOptions = {}): Promise<void> {
  const format = options.format || 'text';
  const isJson = format === 'json';
  const isMarkdown = format === 'markdown' || format === 'md';

  try {
    if (isAllReposMode(options)) {
      await runConsolidatedDigest(options);
      return;
    }

    const repoPath = process.cwd();

    // Check if repo is initialized
    if (!existsSync(join(repoPath, '.worktale', 'config.json'))) {
      if (isJson) {
        console.log(JSON.stringify({ error: 'not-initialized', path: repoPath }));
      } else {
        console.log('');
        console.log('  ' + dimText('worktale:') + ' not initialized in this repo.');
        console.log('  Run ' + brandText('worktale init') + ' to get started.');
        console.log('');
      }
      closeDb();
      process.exit(0);
      return;
    }

    const repo = getRepo(repoPath);
    if (!repo) {
      if (isJson) {
        console.log(JSON.stringify({ error: 'repo-not-found', path: repoPath }));
      } else {
        console.log('');
        console.log('  ' + dimText('worktale:') + ' repo not found in database.');
        console.log('');
      }
      closeDb();
      process.exit(0);
      return;
    }

    const today = getDateString();
    const todayDate = new Date();
    const commits = getCommitsByDate(repo.id, today);
    const summary = getDailySummary(repo.id, today);

    if (!isJson && !isMarkdown) {
      console.log('');
      console.log('  ' + streakText('⚡') + ' ' + chalk.bold('WORKTALE DIGEST') + ' ' + dimText('— ' + formatDate(todayDate)));
      console.log('');
    }

    if (commits.length === 0) {
      if (isJson) {
        console.log(JSON.stringify({ date: today, repo: repo.name, commits: [], summary: null, modules: [], ai: null, note: 'no-commits' }));
      } else if (isMarkdown) {
        console.log(`# Worktale digest — ${today}\n\n_No commits today._`);
      } else {
        console.log('  ' + dimText('No commits today. Nothing to digest yet.'));
        console.log('  ' + dimText('Make some commits and come back later!'));
        console.log('');
      }
      closeDb();
      process.exit(0);
      return;
    }

    const summaryData = summary ?? {
      commits_count: commits.length,
      lines_added: commits.reduce((s, c) => s + c.lines_added, 0),
      lines_removed: commits.reduce((s, c) => s + c.lines_removed, 0),
      files_touched: commits.reduce((s, c) => s + c.files_changed, 0),
    };

    const modules = getModuleActivityByDate(repo.id, today);

    // Gather AI session data for digest
    const aiSessions = getAiSessionsByDate(repo.id, today);
    let aiData: AiSessionDigestData | undefined;
    if (aiSessions.length > 0) {
      const toolSet = new Set<string>();
      const modelSet = new Set<string>();
      const providerSet = new Set<string>();
      let totalCost = 0;
      let totalTokens = 0;
      for (const s of aiSessions) {
        if (s.tool) toolSet.add(s.tool);
        if (s.model) modelSet.add(s.model);
        if (s.provider) providerSet.add(s.provider);
        totalCost += s.cost_usd;
        totalTokens += s.input_tokens + s.output_tokens;
      }
      aiData = {
        total_sessions: aiSessions.length,
        total_cost: totalCost,
        total_tokens: totalTokens,
        tools: [...toolSet],
        models: [...modelSet],
        providers: [...providerSet],
      };
    }

    // JSON mode: emit raw structured data and exit before interactive path
    if (isJson) {
      console.log(JSON.stringify({
        date: today,
        repo: { id: repo.id, name: repo.name, path: repo.path },
        summary: summaryData,
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          timestamp: c.timestamp,
          lines_added: c.lines_added,
          lines_removed: c.lines_removed,
          files_changed: c.files_changed,
          branch: c.branch,
        })),
        modules,
        ai: aiData ?? null,
        user_notes: summary?.user_notes ?? null,
        ai_draft: summary?.ai_draft ?? null,
      }, null, 2));
      closeDb();
      process.exit(0);
      return;
    }

    // Check AI config
    const config = loadConfig();
    const aiProvider = config.ai.provider;
    let digest = '';

    if (aiProvider === 'ollama' && config.ai.model) {
      // Ollama mode
      const ollamaUrl = config.ai.ollamaUrl || 'http://localhost:11434';
      const model = config.ai.model;

      console.log('  ' + dimText('Using Ollama (' + model + ')...'));
      console.log('');

      const prompt = buildOllamaPrompt(commits, summaryData, modules);

      try {
        // Quick connectivity check
        const checkResponse = await fetch(`${ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });

        if (!checkResponse.ok) {
          throw new Error('Cannot connect to Ollama');
        }

        digest = await generateWithOllama(prompt, model, ollamaUrl);
      } catch (ollamaErr: unknown) {
        const errMsg = ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr);
        console.log('  ' + chalk.yellow('⚠') + '  ' + chalk.yellow('Ollama not available: ' + errMsg));
        console.log('  ' + dimText('Falling back to template mode...'));
        console.log('');

        // Fallback to template
        digest = generateTemplateDigest(todayDate, commits, summaryData, modules, aiData);
      }
    } else {
      // Template mode (default)
      digest = generateTemplateDigest(todayDate, commits, summaryData, modules, aiData);
    }

    // Display the draft
    console.log('  ' + dimText('─'.repeat(50)));
    console.log('');

    if (isMarkdown) {
      // Raw markdown output — no chalk styling, no interactive prompt
      console.log(digest);
      closeDb();
      process.exit(0);
      return;
    }

    // Render markdown with basic chalk formatting
    const lines = digest.split('\n');
    for (const line of lines) {
      if (line.startsWith('## ')) {
        console.log('  ' + chalk.bold(line.slice(3)));
      } else if (line.startsWith('### ')) {
        console.log('  ' + brandText(line.slice(4)));
      } else if (line.startsWith('- ')) {
        console.log('  ' + dimText('•') + ' ' + line.slice(2));
      } else {
        console.log('  ' + line);
      }
    }

    console.log('');
    console.log('  ' + dimText('─'.repeat(50)));
    console.log('');

    // Ask user to save
    const shouldSave = await promptYesNo('  Save this digest? (Y/n) ');

    if (shouldSave) {
      updateUserNotes(repo.id, today, digest);
      console.log('');
      console.log('  ' + positiveText('✓') + '  Digest saved!');
    } else {
      console.log('');
      console.log('  ' + dimText('Digest discarded.'));
    }

    console.log('');
    showCatchupBanner();

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}
