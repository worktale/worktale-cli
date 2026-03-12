import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getRepo, addRepo } from '../db/repos.js';
import { appendUserNotes } from '../db/daily-summaries.js';
import { closeDb } from '../db/index.js';
import { getDateString } from '../utils/formatting.js';
import { brandText, dimText, positiveText } from '../tui/theme.js';

export async function noteCommand(message?: string): Promise<void> {
  try {
    const repoPath = process.cwd();

    if (!message || message.trim().length === 0) {
      console.log('');
      console.log('  ' + dimText('Usage:') + ' worktale note "your note here"');
      console.log('');
      console.log('  Append a note to today\'s work narrative.');
      console.log('  Designed for AI coding agents to narrate session context.');
      console.log('');
      console.log('  ' + dimText('Examples:'));
      console.log('    worktale note "Refactored auth middleware for compliance"');
      console.log('    worktale note "Fixed race condition in worker queue — root cause was missing mutex"');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    // Auto-register repo if it has a .git directory but isn't tracked
    let repo = getRepo(repoPath);
    if (!repo && existsSync(join(repoPath, '.git'))) {
      const name = basename(repoPath);
      addRepo(repoPath, name);
      repo = getRepo(repoPath);
    }

    if (!repo) {
      console.log('');
      console.log('  ' + dimText('worktale:') + ' not a tracked repo.');
      console.log('  Run ' + brandText('worktale init') + ' to get started.');
      console.log('');
      closeDb();
      process.exit(1);
      return;
    }

    const today = getDateString();
    appendUserNotes(repo.id, today, message.trim());

    console.log('  ' + positiveText('\u2713') + '  Note added to ' + chalk.bold(today));

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}
