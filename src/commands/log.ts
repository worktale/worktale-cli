import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRepo } from '../db/repos.js';
import { getCommitsByDate } from '../db/commits.js';
import { getDailySummariesRange } from '../db/daily-summaries.js';
import { closeDb } from '../db/index.js';
import { formatNumber, formatDate, getDateString } from '../utils/formatting.js';
import { brandText, positiveText, negativeText, dimText, streakText } from '../tui/theme.js';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export async function logCommand(options: { days: string; repo?: string; format?: string }): Promise<void> {
  const format = options.format || 'text';
  const isJson = format === 'json';
  const isCsv = format === 'csv';
  try {
    const repoPath = options.repo ?? process.cwd();
    const days = parseInt(options.days, 10) || 7;

    // Check if repo is initialized
    if (!existsSync(join(repoPath, '.worktale', 'config.json'))) {
      if (isJson) console.log(JSON.stringify({ error: 'not-initialized', path: repoPath }));
      else if (isCsv) console.log('');
      else {
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
      if (isJson) console.log(JSON.stringify({ error: 'repo-not-found', path: repoPath }));
      else if (isCsv) console.log('');
      else {
        console.log('');
        console.log('  ' + dimText('worktale:') + ' repo not found in database.');
        console.log('  Run ' + brandText('worktale init') + ' to re-initialize.');
        console.log('');
      }
      closeDb();
      process.exit(0);
      return;
    }

    // Calculate date range
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    const startDateStr = getDateString(startDate);
    const endDateStr = getDateString(today);

    // Get summaries for the range
    const summaries = getDailySummariesRange(repo.id, startDateStr, endDateStr);
    const summaryMap = new Map(summaries.map((s) => [s.date, s]));

    if (isJson || isCsv) {
      const rows: Array<{
        date: string;
        commits_count: number;
        lines_added: number;
        lines_removed: number;
        files_touched: number;
        commits: Array<{ sha: string; message: string; author: string; timestamp: string; lines_added: number; lines_removed: number; files_changed: number; branch?: string }>;
      }> = [];
      for (let d = 0; d < days; d++) {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
        const dateStr = getDateString(date);
        const summary = summaryMap.get(dateStr);
        if (!summary || summary.commits_count === 0) continue;
        const commits = getCommitsByDate(repo.id, dateStr);
        rows.push({
          date: dateStr,
          commits_count: summary.commits_count,
          lines_added: summary.lines_added,
          lines_removed: summary.lines_removed,
          files_touched: summary.files_touched,
          commits: commits.map((c) => ({
            sha: c.sha,
            message: c.message ?? '',
            author: c.author ?? '',
            timestamp: c.timestamp,
            lines_added: c.lines_added,
            lines_removed: c.lines_removed,
            files_changed: c.files_changed,
            branch: c.branch ?? undefined,
          })),
        });
      }
      if (isJson) {
        console.log(JSON.stringify({ repo: repo.name, days, rows }, null, 2));
      } else {
        console.log('date,sha,message,author,timestamp,lines_added,lines_removed,files_changed,branch');
        for (const r of rows) {
          for (const c of r.commits) {
            console.log([r.date, c.sha, c.message, c.author, c.timestamp, c.lines_added, c.lines_removed, c.files_changed, c.branch ?? ''].map(csvEscape).join(','));
          }
        }
      }
      closeDb();
      process.exit(0);
      return;
    }

    console.log('');
    console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE LOG') + ' ' + dimText('\u2014 Last ' + days + ' days'));
    console.log('');

    let hasAnyData = false;

    // Iterate from today backwards
    for (let d = 0; d < days; d++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
      const dateStr = getDateString(date);
      const summary = summaryMap.get(dateStr);

      if (!summary || summary.commits_count === 0) continue;

      hasAnyData = true;

      // Date header
      const dateLabel = formatDate(date);
      console.log('  ' + dimText('\u2500\u2500\u2500 ' + dateLabel + ' \u2500\u2500\u2500'));

      // Summary line
      const commitLabel = summary.commits_count === 1 ? '1 commit' : `${summary.commits_count} commits`;
      const linesStr =
        positiveText('+' + formatNumber(summary.lines_added)) +
        ' / ' +
        negativeText('-' + formatNumber(summary.lines_removed));
      const filesStr = formatNumber(summary.files_touched) + ' files';

      console.log('  ' + commitLabel + ' \u00B7 ' + linesStr + ' \u00B7 ' + filesStr);

      // Get individual commits for this day
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
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}
