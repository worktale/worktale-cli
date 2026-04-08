import chalk from 'chalk';
import { brandText, positiveText, negativeText, dimText, streakText } from '../tui/theme.js';
import { getRepo, getAllRepos } from '../db/repos.js';
import { getCommitsByDate, getAllCommitsByDate } from '../db/commits.js';
import { getDailySummary, getAllReposDailySummary } from '../db/daily-summaries.js';
import { closeDb } from '../db/index.js';
import { formatNumber, formatDate, formatRelativeTime, formatDuration, getDateString } from '../utils/formatting.js';
import { showCatchupBanner } from '../utils/catchup-banner.js';
import { detectMode } from '../utils/mode.js';

export async function todayCommand(): Promise<void> {
  try {
    const mode = detectMode();

    if (mode.type === 'not-initialized') {
      console.log('');
      console.log('  ' + dimText('worktale:') + ' not initialized in this repo.');
      console.log('  Run ' + brandText('worktale init') + ' to get started.');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    const today = getDateString();
    const dateStr = formatDate(new Date());

    if (mode.type === 'all-repos') {
      const repos = getAllRepos();
      if (repos.length === 0) {
        console.log('');
        console.log('  ' + dimText('worktale:') + ' no repos tracked yet.');
        console.log('');
        closeDb();
        process.exit(0);
        return;
      }

      const commits = getAllCommitsByDate(today);
      const summary = getAllReposDailySummary(today);

      console.log('');
      console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE') + ' ' + dimText('\u2014') + ' Today, ' + dateStr + dimText(' \u00B7 ' + repos.length + ' repos'));
      console.log('');

      if (commits.length === 0) {
        console.log('  ' + dimText('No commits yet today. Time to build something!'));
        console.log('');
        closeDb();
        process.exit(0);
        return;
      }

      const totalAdded = summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0);
      const totalRemoved = summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0);
      const totalFiles = summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0);

      const timestamps = commits.map((c) => new Date(c.timestamp).getTime()).sort((a, b) => a - b);
      let codingTimeStr = '< 1m';
      if (timestamps.length >= 2) {
        const diffMs = timestamps[timestamps.length - 1] - timestamps[0];
        const diffMinutes = Math.round(diffMs / 60_000);
        codingTimeStr = formatDuration(diffMinutes);
      }

      console.log(
        '  ' +
        dimText('Commits:') + '  ' + chalk.bold(String(commits.length)) +
        '          ' +
        dimText('Lines:') + '  ' + positiveText('+' + formatNumber(totalAdded)) + ' / ' + negativeText('-' + formatNumber(totalRemoved))
      );
      console.log(
        '  ' +
        dimText('Files:') + '    ' + chalk.bold(String(totalFiles)) +
        '         ' +
        dimText('Time:') + '   ' + chalk.bold(codingTimeStr)
      );
      console.log('');

      console.log('  ' + chalk.bold('Recent:'));

      const recentCommits = commits.slice(0, 10);
      for (const commit of recentCommits) {
        const relTime = formatRelativeTime(commit.timestamp);
        const msg = commit.message
          ? (commit.message.length > 45 ? commit.message.slice(0, 42) + '...' : commit.message)
          : '(no message)';
        console.log(
          '  ' + brandText('\u25CF') + ' ' +
          dimText(relTime.padEnd(10)) +
          dimText(commit.repo_name.padEnd(18)) +
          msg
        );
      }

      if (commits.length > 10) {
        console.log('  ' + dimText('  ...and ' + (commits.length - 10) + ' more'));
      }

      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    // Single-repo mode (existing behavior)
    const repo = getRepo(mode.repoPath);
    if (!repo) {
      console.log('');
      console.log('  ' + dimText('worktale:') + ' repo not found in database.');
      console.log('  Run ' + brandText('worktale init') + ' to re-initialize.');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    const commits = getCommitsByDate(repo.id, today);
    const summary = getDailySummary(repo.id, today);

    console.log('');
    console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE') + ' ' + dimText('\u2014') + ' Today, ' + dateStr);
    console.log('');

    if (commits.length === 0) {
      console.log('  ' + dimText('No commits yet today. Time to build something!'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    const totalAdded = summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0);
    const totalRemoved = summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0);
    const totalFiles = summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0);

    const timestamps = commits.map((c) => new Date(c.timestamp).getTime()).sort((a, b) => a - b);
    let codingTimeStr = '< 1m';
    if (timestamps.length >= 2) {
      const diffMs = timestamps[timestamps.length - 1] - timestamps[0];
      const diffMinutes = Math.round(diffMs / 60_000);
      codingTimeStr = formatDuration(diffMinutes);
    }

    console.log(
      '  ' +
      dimText('Commits:') + '  ' + chalk.bold(String(commits.length)) +
      '          ' +
      dimText('Lines:') + '  ' + positiveText('+' + formatNumber(totalAdded)) + ' / ' + negativeText('-' + formatNumber(totalRemoved))
    );
    console.log(
      '  ' +
      dimText('Files:') + '    ' + chalk.bold(String(totalFiles)) +
      '         ' +
      dimText('Time:') + '   ' + chalk.bold(codingTimeStr)
    );
    console.log('');

    console.log('  ' + chalk.bold('Recent:'));

    const recentCommits = [...commits].reverse().slice(0, 10);
    for (const commit of recentCommits) {
      const relTime = formatRelativeTime(commit.timestamp);
      const msg = commit.message
        ? (commit.message.length > 55 ? commit.message.slice(0, 52) + '...' : commit.message)
        : '(no message)';
      console.log(
        '  ' + brandText('\u25CF') + ' ' +
        dimText(relTime.padEnd(10)) +
        msg
      );
    }

    if (commits.length > 10) {
      console.log('  ' + dimText(`  ...and ${commits.length - 10} more`));
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
