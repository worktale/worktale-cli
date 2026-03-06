#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { todayCommand } from './commands/today.js';
import { statusCommand } from './commands/status.js';
import { reposCommand } from './commands/repos.js';
import { configCommand } from './commands/config.js';
import { logCommand } from './commands/log.js';
import { digestCommand } from './commands/digest.js';
import { publishCommand } from './commands/publish.js';
import { captureCommand } from './commands/capture.js';
import { dashCommand } from './commands/dash.js';
import { installNudge, removeNudge, checkNudge, isNudgeInstalled } from './nudge/index.js';

const program = new Command();

program
  .name('worktale')
  .description('Zero-friction, local-first developer work journal')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize Worktale in the current git repo')
  .option('--global', 'Set up global nudge configuration')
  .action(async (options: { global?: boolean }) => {
    await initCommand(options);
  });

program
  .command('dash')
  .description('Open the interactive dashboard')
  .action(async () => {
    await dashCommand();
  });

program
  .command('today')
  .description("Show today's activity summary")
  .action(async () => {
    await todayCommand();
  });

program
  .command('log')
  .description('Browse historical log entries')
  .option('-d, --days <n>', 'Number of days to show', '7')
  .option('-r, --repo <path>', 'Path to repo')
  .action(async (options: { days: string; repo?: string }) => {
    await logCommand(options);
  });

program
  .command('digest')
  .description("Generate today's work digest")
  .action(async () => {
    await digestCommand();
  });

program
  .command('publish')
  .description('Publish your digest (coming soon)')
  .action(async () => {
    await publishCommand();
  });

program
  .command('status')
  .description('Show one-line status')
  .action(async () => {
    await statusCommand();
  });

program
  .command('repos [action] [target]')
  .description('List or manage tracked repos (remove <name|number>)')
  .action(async (action?: string, target?: string) => {
    await reposCommand(action, target);
  });

program
  .command('config [action] [key] [value]')
  .description('View or modify configuration')
  .action(async (action?: string, key?: string, value?: string) => {
    await configCommand(action, key, value);
  });

program
  .command('capture')
  .description('Capture the latest commit (used by git hooks)')
  .option('-s, --silent', 'Suppress output')
  .action(async (options: { silent?: boolean }) => {
    await captureCommand(options);
  });

program
  .command('nudge')
  .description('Check and display end-of-day nudge')
  .option('--check', 'Run nudge check (used by shell profile)')
  .option('--install', 'Install nudge to shell profile')
  .option('--remove', 'Remove nudge from shell profile')
  .option('--status', 'Check if nudge is installed')
  .action(async (opts: { check?: boolean; install?: boolean; remove?: boolean; status?: boolean }) => {
    if (opts.check) {
      checkNudge();
    } else if (opts.install) {
      const result = installNudge();
      if (result.installed) {
        console.log(`Nudge installed to ~/${result.profile}`);
      } else {
        console.log('No shell profile found. Create a .bashrc or .zshrc and try again.');
      }
    } else if (opts.remove) {
      removeNudge();
      console.log('Nudge removed from shell profile.');
    } else if (opts.status) {
      const installed = isNudgeInstalled();
      console.log(installed ? 'Nudge is installed.' : 'Nudge is not installed.');
    } else {
      checkNudge();
    }
  });

// Default command: if no args, open dashboard
program.action(async () => {
  await dashCommand();
});

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
