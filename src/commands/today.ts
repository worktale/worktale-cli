import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { brandText, positiveText, negativeText, dimText, streakText } from '../tui/theme.js';
import { getRepo } from '../db/repos.js';
import { getCommitsByDate } from '../db/commits.js';
import { getDailySummary } from '../db/daily-summaries.js';
import { closeDb } from '../db/index.js';
import { formatNumber, formatDate, formatRelativeTime, formatDuration, getDateString } from '../utils/formatting.js';
import { showCatchupBanner } from '../utils/catchup-banner.js';
import { getAiSessionsByDate, getAiCostByDate, getAiTokensByDate } from '../db/ai-sessions.js';

export async function todayCommand(): Promise<void> {
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
      console.log('  Run ' + brandText('worktale init') + ' to re-initialize.');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    const today = getDateString();
    const commits = getCommitsByDate(repo.id, today);
    const summary = getDailySummary(repo.id, today);

    // Header
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = formatDate(now);
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

    // Stats
    const totalAdded = summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0);
    const totalRemoved = summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0);
    const totalFiles = summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0);

    // Estimate coding time from first to last commit
    const timestamps = commits.map((c) => new Date(c.timestamp).getTime()).sort((a, b) => a - b);
    let codingTimeStr = '< 1m';
    if (timestamps.length >= 2) {
      const diffMs = timestamps[timestamps.length - 1] - timestamps[0];
      const diffMinutes = Math.round(diffMs / 60_000);
      codingTimeStr = formatDuration(diffMinutes);
    }

    const commitLabel = 'Commits:';
    const linesLabel = 'Lines:';
    const filesLabel = 'Files:';
    const timeLabel = 'Time:';

    console.log(
      '  ' +
      dimText(commitLabel) + '  ' + chalk.bold(String(commits.length)) +
      '          ' +
      dimText(linesLabel) + '  ' + positiveText('+' + formatNumber(totalAdded)) + ' / ' + negativeText('-' + formatNumber(totalRemoved))
    );
    console.log(
      '  ' +
      dimText(filesLabel) + '    ' + chalk.bold(String(totalFiles)) +
      '         ' +
      dimText(timeLabel) + '   ' + chalk.bold(codingTimeStr)
    );
    console.log('');

    // Recent commits (most recent first)
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

    // AI session info
    const aiSessions = getAiSessionsByDate(repo.id, today);
    if (aiSessions.length > 0) {
      const aiCost = getAiCostByDate(repo.id, today);
      const aiTokens = getAiTokensByDate(repo.id, today);
      const totalTokens = aiTokens.input + aiTokens.output;
      const toolSet = new Set<string>();
      const modelSet = new Set<string>();
      for (const s of aiSessions) {
        if (s.tool) toolSet.add(s.tool);
        if (s.model) modelSet.add(s.model);
      }

      console.log('');
      console.log('  ' + chalk.bold('AI:'));
      const parts: string[] = [];
      parts.push(`${aiSessions.length} session${aiSessions.length !== 1 ? 's' : ''}`);
      if (totalTokens > 0) parts.push(`${formatNumber(totalTokens)} tokens`);
      if (aiCost > 0) parts.push(streakText(`$${aiCost.toFixed(4)}`));
      console.log('  ' + parts.join('  \u00B7  '));

      if (toolSet.size > 0) {
        console.log('  ' + dimText('Tools: ') + [...toolSet].map((t) => brandText(t)).join(', '));
      }
      if (modelSet.size > 0) {
        console.log('  ' + dimText('Models: ') + [...modelSet].join(', '));
      }
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
