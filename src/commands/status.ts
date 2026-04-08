import chalk from 'chalk';
import { getRepo, getAllRepos } from '../db/repos.js';
import { getDailySummary, getAllReposDailySummary } from '../db/daily-summaries.js';
import { getStreakInfo, getAllReposStreakInfo } from '../utils/streaks.js';
import { closeDb } from '../db/index.js';
import { formatNumber, getDateString } from '../utils/formatting.js';
import { positiveText, negativeText, streakText } from '../tui/theme.js';
import { detectMode } from '../utils/mode.js';

export async function statusCommand(): Promise<void> {
  try {
    const mode = detectMode();

    if (mode.type === 'not-initialized') {
      console.log(streakText('\u26A1') + ' worktale: not initialized \u2014 run \'worktale init\'');
      closeDb();
      process.exit(0);
      return;
    }

    const today = getDateString();

    if (mode.type === 'all-repos') {
      const repos = getAllRepos();
      if (repos.length === 0) {
        console.log(streakText('\u26A1') + ' worktale: no repos tracked');
        closeDb();
        process.exit(0);
        return;
      }

      const summary = getAllReposDailySummary(today);
      const streak = getAllReposStreakInfo();

      if (!summary || summary.commits_count === 0) {
        const streakPart = streak.current > 0
          ? ' \u00B7 \uD83D\uDD25 streak: ' + streak.current + ' days'
          : '';
        console.log(
          streakText('\u26A1') + ' worktale: 0 commits today across ' + repos.length + ' repos' + streakPart
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
        commitStr + ' today across ' + repos.length + ' repos \u00B7 ' +
        linesStr +
        streakPart
      );

      closeDb();
      process.exit(0);
      return;
    }

    // Single-repo mode (existing behavior)
    const repo = getRepo(mode.repoPath);
    if (!repo) {
      console.log(streakText('\u26A1') + ' worktale: not initialized \u2014 run \'worktale init\'');
      closeDb();
      process.exit(0);
      return;
    }

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
