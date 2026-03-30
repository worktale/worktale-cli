import chalk from 'chalk';
import { closeDb } from '../db/index.js';
import { brandText, dimText, positiveText, streakText } from '../tui/theme.js';
import { isCloudConfigured, cloudFetch } from '../utils/cloud-client.js';

export async function standupCommand(options: { copy?: boolean; format?: string } = {}): Promise<void> {
  try {
    if (!isCloudConfigured()) {
      console.log('');
      console.log('  ' + dimText('Standup generation requires Worktale Cloud.'));
      console.log('  ' + dimText('Run') + ' ' + brandText('worktale cloud login') + ' ' + dimText('to connect.'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    console.log('');
    console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('Generating standup...'));

    const result = await cloudFetch<{
      output: string;
      dateRangeStart: string;
      dateRangeEnd: string;
    }>('/api/v1/standup', {
      method: 'POST',
      body: {},
    });

    if (!result.data) {
      console.log('  ' + dimText('No activity data available.'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    let output = result.data.output;

    if (options.format === 'slack') {
      // Convert markdown to Slack-compatible formatting
      output = output
        .replace(/^### (.*)/gm, '*$1*')
        .replace(/^## (.*)/gm, '*$1*')
        .replace(/^\- /gm, '• ');
    }

    console.log('');
    console.log('  ' + dimText('\u2500'.repeat(50)));
    console.log('');

    const lines = output.split('\n');
    for (const line of lines) {
      console.log('  ' + line);
    }

    console.log('');
    console.log('  ' + dimText('\u2500'.repeat(50)));

    if (options.copy) {
      try {
        const { execSync } = await import('node:child_process');
        const platform = process.platform;
        if (platform === 'darwin') {
          execSync('pbcopy', { input: output });
        } else if (platform === 'win32') {
          execSync('clip', { input: output });
        } else {
          execSync('xclip -selection clipboard', { input: output });
        }
        console.log('  ' + positiveText('\u2713') + '  Copied to clipboard');
      } catch {
        console.log('  ' + dimText('Could not copy to clipboard'));
      }
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
