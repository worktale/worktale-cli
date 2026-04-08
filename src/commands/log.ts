import chalk from 'chalk';
import { getRepo, getAllRepos } from '../db/repos.js';
import { getCommitsByDate, getAllCommitsByDate } from '../db/commits.js';
import { getDailySummariesRange, getAllReposDailySummariesRange } from '../db/daily-summaries.js';
import { closeDb } from '../db/index.js';
import { formatNumber, formatDate, getDateString } from '../utils/formatting.js';
import { brandText, positiveText, negativeText, dimText, streakText } from '../tui/theme.js';
import { detectMode } from '../utils/mode.js';

export async function logCommand(options: { days: string; repo?: string }): Promise<void> {
  try {
    const days = parseInt(options.days, 10) || 7;
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    const startDateStr = getDateString(startDate);
    const endDateStr = getDateString(today);

    // If --repo is passed, use that path directly (existing behavior)
    if (options.repo) {
      await logSingleRepo(options.repo, days, startDateStr, endDateStr, today);
      return;
    }

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

      console.log('');
      console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE LOG') + ' ' + dimText('\u2014 Last ' + days + ' days \u00B7 ' + repos.length + ' repos'));
      console.log('');

      const summaries = getAllReposDailySummariesRange(startDateStr, endDateStr);
      const summaryMap = new Map(summaries.map((s) => [s.date, s]));

      let hasAnyData = false;

      for (let d = 0; d < days; d++) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
        const dateStr = getDateString(date);
        const summary = summaryMap.get(dateStr);

        if (!summary || summary.commits_count === 0) continue;

        hasAnyData = true;

        const dateLabel = formatDate(date);
        console.log('  ' + dimText('\u2500\u2500\u2500 ' + dateLabel + ' \u2500\u2500\u2500'));

        const commitLabel = summary.commits_count === 1 ? '1 commit' : `${summary.commits_count} commits`;
        const linesStr =
          positiveText('+' + formatNumber(summary.lines_added)) +
          ' / ' +
          negativeText('-' + formatNumber(summary.lines_removed));
        const filesStr = formatNumber(summary.files_touched) + ' files';

        console.log('  ' + commitLabel + ' \u00B7 ' + linesStr + ' \u00B7 ' + filesStr);

        const commits = getAllCommitsByDate(dateStr);
        const displayCommits = commits.slice(0, 8);

        for (const commit of displayCommits) {
          const msg = commit.message
            ? (commit.message.length > 50 ? commit.message.slice(0, 47) + '...' : commit.message)
            : '(no message)';
          console.log('  ' + brandText('\u25CF') + ' ' + dimText(commit.repo_name.padEnd(18)) + msg);
        }

        if (commits.length > 8) {
          console.log('  ' + dimText('  ...and ' + (commits.length - 8) + ' more'));
        }

        console.log('');
      }

      if (!hasAnyData) {
        console.log('  ' + dimText('No activity in the last ' + days + ' days.'));
        console.log('');
      }

      closeDb();
      process.exit(0);
      return;
    }

    // Single-repo mode
    await logSingleRepo(mode.repoPath, days, startDateStr, endDateStr, today);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}

async function logSingleRepo(repoPath: string, days: number, startDateStr: string, endDateStr: string, today: Date): Promise<void> {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');

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
    console.log('  Run ' + brandText('worktale init') + ' to re-initialize.');
    console.log('');
    closeDb();
    process.exit(0);
    return;
  }

  console.log('');
  console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE LOG') + ' ' + dimText('\u2014 Last ' + days + ' days'));
  console.log('');

  const summaries = getDailySummariesRange(repo.id, startDateStr, endDateStr);
  const summaryMap = new Map(summaries.map((s) => [s.date, s]));

  let hasAnyData = false;

  for (let d = 0; d < days; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    const dateStr = getDateString(date);
    const summary = summaryMap.get(dateStr);

    if (!summary || summary.commits_count === 0) continue;

    hasAnyData = true;

    const dateLabel = formatDate(date);
    console.log('  ' + dimText('\u2500\u2500\u2500 ' + dateLabel + ' \u2500\u2500\u2500'));

    const commitLabel = summary.commits_count === 1 ? '1 commit' : `${summary.commits_count} commits`;
    const linesStr =
      positiveText('+' + formatNumber(summary.lines_added)) +
      ' / ' +
      negativeText('-' + formatNumber(summary.lines_removed));
    const filesStr = formatNumber(summary.files_touched) + ' files';

    console.log('  ' + commitLabel + ' \u00B7 ' + linesStr + ' \u00B7 ' + filesStr);

    const commits = getCommitsByDate(repo.id, dateStr);
    const displayCommits = commits.slice().reverse().slice(0, 8);

    for (const commit of displayCommits) {
      const msg = commit.message
        ? (commit.message.length > 60 ? commit.message.slice(0, 57) + '...' : commit.message)
        : '(no message)';
      console.log('  ' + brandText('\u25CF') + ' ' + msg);
    }

    if (commits.length > 8) {
      console.log('  ' + dimText('  ...and ' + (commits.length - 8) + ' more'));
    }

    console.log('');
  }

  if (!hasAnyData) {
    console.log('  ' + dimText('No activity in the last ' + days + ' days.'));
    console.log('');
  }

  closeDb();
  process.exit(0);
}
