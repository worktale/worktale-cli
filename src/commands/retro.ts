import chalk from 'chalk';
import { closeDb } from '../db/index.js';
import { brandText, dimText, streakText } from '../tui/theme.js';
import { isCloudConfigured, cloudFetch } from '../utils/cloud-client.js';

export async function retroCommand(options: { days?: string; since?: string } = {}): Promise<void> {
  try {
    if (!isCloudConfigured()) {
      console.log('');
      console.log('  ' + dimText('Retro generation requires Worktale Cloud.'));
      console.log('  ' + dimText('Run') + ' ' + brandText('worktale cloud login') + ' ' + dimText('to connect.'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    console.log('');
    console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('Generating retrospective...'));

    const body: Record<string, unknown> = {};
    if (options.days) body.days = parseInt(options.days, 10);
    if (options.since) body.dateRangeStart = options.since;

    const result = await cloudFetch<{
      output: string;
      dateRangeStart: string;
      dateRangeEnd: string;
    }>('/api/v1/retro', {
      method: 'POST',
      body,
    });

    if (!result.data) {
      console.log('  ' + dimText('No activity data available for retro.'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    console.log('');
    console.log('  ' + chalk.bold(`Retro: ${result.data.dateRangeStart} — ${result.data.dateRangeEnd}`));
    console.log('  ' + dimText('\u2500'.repeat(50)));
    console.log('');

    const lines = result.data.output.split('\n');
    for (const line of lines) {
      console.log('  ' + line);
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
