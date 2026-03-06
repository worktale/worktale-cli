import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getRepo } from '../db/repos.js';
import { getDailySummary } from '../db/daily-summaries.js';
import { getStreakInfo } from '../utils/streaks.js';
import { closeDb } from '../db/index.js';
import { formatNumber, getDateString } from '../utils/formatting.js';
import { positiveText, negativeText, streakText } from '../tui/theme.js';

export async function statusCommand(): Promise<void> {
  try {
    const repoPath = process.cwd();

    // Check if repo is initialized
    if (!existsSync(join(repoPath, '.worktale', 'config.json'))) {
      console.log(streakText('\u26A1') + ' worktale: not initialized \u2014 run \'worktale init\'');
      closeDb();
      process.exit(0);
      return;
    }

    const repo = getRepo(repoPath);
    if (!repo) {
      console.log(streakText('\u26A1') + ' worktale: not initialized \u2014 run \'worktale init\'');
      closeDb();
      process.exit(0);
      return;
    }

    const today = getDateString();
    const summary = getDailySummary(repo.id, today);
    const streak = getStreakInfo(repo.id);

    if (!summary || summary.commits_count === 0) {
      const streakPart = streak.current > 0
        ? ' \u00B7 \uD83D\uDD25 streak: ' + streak.current + ' days'
        : '';
      console.log(
        streakText('\u26A1') + ' worktale: 0 commits today' + streakPart
      );
      closeDb();
      process.exit(0);
      return;
    }

    const commitStr = summary.commits_count === 1 ? '1 commit' : `${summary.commits_count} commits`;
    const linesStr = positiveText('+' + formatNumber(summary.lines_added)) + '/' + negativeText('-' + formatNumber(summary.lines_removed));
    const streakPart = streak.current > 0
      ? ' \u00B7 \uD83D\uDD25 streak: ' + streak.current + ' days'
      : '';

    console.log(
      streakText('\u26A1') + ' worktale: ' +
      commitStr + ' today \u00B7 ' +
      linesStr +
      streakPart
    );

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}
