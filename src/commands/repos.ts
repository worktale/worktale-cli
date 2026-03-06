import chalk from 'chalk';
import { getAllRepos, removeRepo } from '../db/repos.js';
import { getCommitCount } from '../db/commits.js';
import { closeDb } from '../db/index.js';
import { formatNumber, formatRelativeTime } from '../utils/formatting.js';
import { brandText, dimText, streakText } from '../tui/theme.js';
import { removeHooks } from '../git/hooks.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function reposCommand(action?: string, target?: string): Promise<void> {
  try {
    if (action === 'remove' || action === 'rm') {
      await reposRemoveCommand(target);
      return;
    }

    const repos = getAllRepos();

    console.log('');
    console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE REPOS'));
    console.log('');

    if (repos.length === 0) {
      console.log('  ' + dimText('No repos tracked yet.'));
      console.log('  Run ' + brandText('worktale init') + ' in a git repo to get started.');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      const commitCount = getCommitCount(repo.id);
      const lastSyncedStr = repo.last_synced
        ? formatRelativeTime(repo.last_synced)
        : 'never';

      console.log(
        '  ' + chalk.bold(String(i + 1) + '.') + ' ' +
        brandText(repo.name) + '    ' +
        dimText(repo.path)
      );
      console.log(
        '     ' +
        dimText('Last synced: ' + lastSyncedStr) +
        ' \u00B7 ' +
        dimText(formatNumber(commitCount) + ' commits')
      );
      console.log('');
    }

    const totalLabel = repos.length === 1 ? '1 repo tracked' : `${repos.length} repos tracked`;
    console.log('  ' + dimText('Total: ' + totalLabel));
    console.log('');

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}

async function reposRemoveCommand(target?: string): Promise<void> {
  const repos = getAllRepos();

  if (repos.length === 0) {
    console.log('');
    console.log('  ' + dimText('No repos tracked.'));
    console.log('');
    closeDb();
    process.exit(0);
    return;
  }

  if (!target) {
    console.log('');
    console.log(chalk.red('  Usage: worktale repos remove <number or name>'));
    console.log('');
    console.log('  Run ' + brandText('worktale repos') + ' to see the list.');
    console.log('');
    closeDb();
    process.exit(1);
    return;
  }

  // Match by number (1-based index) or by name (case-insensitive partial match)
  let matched;
  const num = parseInt(target, 10);
  if (!isNaN(num) && num >= 1 && num <= repos.length) {
    matched = repos[num - 1];
  } else {
    const lower = target.toLowerCase();
    matched = repos.find((r) => r.name.toLowerCase() === lower) ||
              repos.find((r) => r.name.toLowerCase().includes(lower));
  }

  if (!matched) {
    console.log('');
    console.log(chalk.red('  No repo matching "' + target + '" found.'));
    console.log('  Run ' + brandText('worktale repos') + ' to see the list.');
    console.log('');
    closeDb();
    process.exit(1);
    return;
  }

  // Remove git hooks if the repo directory still exists
  if (existsSync(join(matched.path, '.git'))) {
    removeHooks(matched.path);
  }

  // Remove from database (cascades to commits, daily_summaries, file_activity)
  removeRepo(matched.id);

  console.log('');
  console.log('  ' + chalk.green('\u2713') + '  Removed ' + chalk.bold(matched.name) + '  ' + dimText(matched.path));
  console.log('');

  closeDb();
  process.exit(0);
}
