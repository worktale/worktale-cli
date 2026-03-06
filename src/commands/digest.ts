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
import { formatNumber, formatDate, getDateString } from '../utils/formatting.js';
import { brandText, positiveText, negativeText, dimText, streakText, secondaryText } from '../tui/theme.js';

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

function generateTemplateDigest(
  date: Date,
  commits: Array<{ message: string | null }>,
  summary: { commits_count: number; lines_added: number; lines_removed: number; files_touched: number },
  modules: Array<{ module: string; percentage: number }>,
): string {
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let md = `## ${dateStr}\n\n`;

  // What I built
  md += '### What I built\n';
  const uniqueMessages = new Set<string>();
  for (const commit of commits) {
    if (commit.message) {
      // Clean up commit message: strip conventional commit prefixes for readability
      let msg = commit.message;
      const prefixMatch = msg.match(/^(?:feat|fix|refactor|chore|docs|test|style|perf|ci|build|revert)(?:\(.+?\))?:\s*/i);
      if (prefixMatch) {
        // Capitalize the action based on the prefix
        const prefix = prefixMatch[0].toLowerCase();
        msg = msg.slice(prefixMatch[0].length);

        if (prefix.startsWith('feat')) {
          msg = 'Added ' + msg.charAt(0).toLowerCase() + msg.slice(1);
        } else if (prefix.startsWith('fix')) {
          msg = 'Fixed ' + msg.charAt(0).toLowerCase() + msg.slice(1);
        } else if (prefix.startsWith('refactor')) {
          msg = 'Refactored ' + msg.charAt(0).toLowerCase() + msg.slice(1);
        } else {
          msg = msg.charAt(0).toUpperCase() + msg.slice(1);
        }
      } else {
        msg = msg.charAt(0).toUpperCase() + msg.slice(1);
      }

      if (!uniqueMessages.has(msg)) {
        uniqueMessages.add(msg);
        md += `- ${msg}\n`;
      }
    }
  }

  md += '\n';

  // Stats
  md += '### Stats\n';
  md += `- ${summary.commits_count} commits, +${formatNumber(summary.lines_added)} / -${formatNumber(summary.lines_removed)} lines, ${summary.files_touched} files touched\n`;
  md += '\n';

  // Areas
  if (modules.length > 0) {
    md += '### Areas\n';
    const topModules = modules.slice(0, 5);
    const parts = topModules.map((m) => `${m.module} (${Math.round(m.percentage)}%)`);
    md += `- ${parts.join(', ')}\n`;
  }

  return md;
}

async function generateWithOllama(prompt: string, model: string, url: string): Promise<string> {
  const response = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!response.ok) throw new Error('Ollama request failed');
  const data = await response.json() as { response: string };
  return data.response;
}

export async function digestCommand(): Promise<void> {
  try {
    const repoPath = process.cwd();

    // Check if repo is initialized
    if (!existsSync(join(repoPath, '.worktale', 'config.json'))) {
      console.log('');
      console.log('  ' + dimText('worktale:') + ' not initialized in this repo.');
      console.log('  Run ' + brandText('worktale init') + ' to get started.');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    const repo = getRepo(repoPath);
    if (!repo) {
      console.log('');
      console.log('  ' + dimText('worktale:') + ' repo not found in database.');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    const today = getDateString();
    const todayDate = new Date();
    const commits = getCommitsByDate(repo.id, today);
    const summary = getDailySummary(repo.id, today);

    console.log('');
    console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE DIGEST') + ' ' + dimText('\u2014 ' + formatDate(todayDate)));
    console.log('');

    if (commits.length === 0) {
      console.log('  ' + dimText('No commits today. Nothing to digest yet.'));
      console.log('  ' + dimText('Make some commits and come back later!'));
      console.log('');
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

      // Build prompt
      const commitList = commits.map((c) => `- ${c.message || '(no message)'}`).join('\n');
      const moduleList = modules.slice(0, 5).map((m) => `${m.module} (${Math.round(m.percentage)}%)`).join(', ');

      const prompt = `You are writing a daily developer work summary. Be concise, factual, and focus on what was actually accomplished.

Here are today's git commits:
${commitList}

Stats: ${summaryData.commits_count} commits, +${summaryData.lines_added}/-${summaryData.lines_removed} lines, ${summaryData.files_touched} files
Active areas: ${moduleList || 'various'}

Write a brief markdown summary with:
1. "What I built" section (bullet points of accomplishments, not raw commit messages)
2. Key stats
3. Areas of focus

Keep it under 200 words. No fluff.`;

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
        digest = generateTemplateDigest(todayDate, commits, summaryData, modules);
      }
    } else {
      // Template mode (default)
      digest = generateTemplateDigest(todayDate, commits, summaryData, modules);
    }

    // Display the draft
    console.log('  ' + dimText('\u2500'.repeat(50)));
    console.log('');

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

    // Upsell message
    console.log('');
    console.log('  ' + dimText('\u2500'.repeat(50)));
    console.log('');
    console.log('  ' + streakText('\u26A1') + '  ' + chalk.bold('Want AI-polished digests?'));
    console.log('  ' + secondaryText('Worktale Cloud (coming soon) turns your raw commits'));
    console.log('  ' + secondaryText('into polished, shareable summaries.'));
    console.log('  ' + brandText('worktale.org') + ' ' + dimText('for early access'));
    console.log('');

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}
