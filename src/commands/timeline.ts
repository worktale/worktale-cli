import chalk from 'chalk';
import { closeDb } from '../db/index.js';
import { brandText, dimText, positiveText, streakText } from '../tui/theme.js';
import { formatNumber } from '../utils/formatting.js';
import { isCloudConfigured, cloudFetchPaged } from '../utils/cloud-client.js';

interface TimelineEntry {
  digestId: string;
  repoName: string;
  repoSlug: string;
  date: string;
  commitsCount: number;
  linesAdded: number;
  linesRemoved: number;
  publishedText: string | null;
  tags: string | null;
}

export async function timelineCommand(options: { since?: string } = {}): Promise<void> {
  try {
    if (!isCloudConfigured()) {
      console.log('');
      console.log('  ' + dimText('Timeline requires Worktale Cloud.'));
      console.log('  ' + dimText('Run') + ' ' + brandText('worktale cloud login') + ' ' + dimText('to connect.'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    console.log('');
    console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('Unified Timeline'));
    console.log('  ' + dimText('\u2500'.repeat(50)));
    console.log('');

    const result = await cloudFetchPaged<TimelineEntry>('/api/v1/timeline');

    if (!result.data || result.data.length === 0) {
      console.log('  ' + dimText('No activity yet. Sync your digests:'));
      console.log('    ' + brandText('worktale publish'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    for (const entry of result.data) {
      const added = positiveText(`+${formatNumber(entry.linesAdded)}`);
      const removed = chalk.red(`-${formatNumber(entry.linesRemoved)}`);

      console.log('  ' + chalk.bold(entry.date) + '  ' + dimText(entry.repoName || entry.repoSlug));
      console.log('    ' + `${entry.commitsCount} commits  ${added} / ${removed}`);
      if (entry.publishedText) {
        const preview = entry.publishedText.slice(0, 120).replace(/\n/g, ' ');
        console.log('    ' + dimText(preview + (entry.publishedText.length > 120 ? '...' : '')));
      }
      console.log('');
    }

    if (result.totalPages > 1) {
      console.log('  ' + dimText(`Page 1 of ${result.totalPages} (${result.totalCount} total entries)`));
      console.log('  ' + dimText('View full timeline at') + ' ' + brandText('worktale.dev'));
    }

    console.log('');

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}
