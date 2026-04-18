import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { getRepo } from '../db/repos.js';
import { getCommitsByDate } from '../db/commits.js';
import { getDailySummary, updateUserNotes } from '../db/daily-summaries.js';
import { getModuleActivityByDate } from '../db/file-activity.js';
import { loadConfig } from '../config/index.js';
import { closeDb } from '../db/index.js';
import { formatDate, getDateString } from '../utils/formatting.js';
import { brandText, positiveText, negativeText, dimText, streakText, secondaryText } from '../tui/theme.js';
import { generateTemplateDigest, generateWithOllama, buildOllamaPrompt } from '../utils/digest-generator.js';
import { showCatchupBanner } from '../utils/catchup-banner.js';
import { getAiSessionsByDate } from '../db/ai-sessions.js';
import type { AiSessionDigestData } from '../utils/digest-generator.js';

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

export async function digestCommand(options: { format?: string } = {}): Promise<void> {
  const format = options.format || 'text';
  const isJson = format === 'json';
  const isMarkdown = format === 'markdown' || format === 'md';
  try {
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
      console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE DIGEST') + ' ' + dimText('\u2014 ' + formatDate(todayDate)));
      console.log('');
    }

    if (commits.length === 0) {
      if (isJson) {
        console.log(JSON.stringify({ date: today, repo: repo.name, commits: [], summary: null, modules: [], ai: null, note: 'no-commits' }));
      } else if (isMarkdown) {
        console.log(`# Worktale digest \u2014 ${today}\n\n_No commits today._`);
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
        console.log('  ' + chalk.yellow('\u26A0') + '  ' + chalk.yellow('Ollama not available: ' + errMsg));
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
    console.log('  ' + dimText('\u2500'.repeat(50)));
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
        console.log('  ' + dimText('\u2022') + ' ' + line.slice(2));
      } else {
        console.log('  ' + line);
      }
    }

    console.log('');
    console.log('  ' + dimText('\u2500'.repeat(50)));
    console.log('');

    // Ask user to save
    const shouldSave = await promptYesNo('  Save this digest? (Y/n) ');

    if (shouldSave) {
      updateUserNotes(repo.id, today, digest);
      console.log('');
      console.log('  ' + positiveText('\u2713') + '  Digest saved!');
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
