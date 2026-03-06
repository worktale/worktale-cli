import chalk from 'chalk';
import { getAllRepos } from '../db/repos.js';
import { getCommitCount } from '../db/commits.js';
import { closeDb } from '../db/index.js';
import { formatNumber, formatRelativeTime } from '../utils/formatting.js';
import { brandText, dimText, streakText } from '../tui/theme.js';

export async function reposCommand(): Promise<void> {
  try {
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
