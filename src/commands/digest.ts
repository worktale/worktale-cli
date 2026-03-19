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
