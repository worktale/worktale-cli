#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
import { batchCommand } from './commands/batch.js';
import { hookCommand } from './commands/hook.js';
import { noteCommand } from './commands/note.js';
import { cloudCommand } from './commands/cloud.js';
import { standupCommand } from './commands/standup.js';
import { retroCommand } from './commands/retro.js';
import { timelineCommand } from './commands/timeline.js';
import { profileCommand } from './commands/profile.js';
import { installNudge, removeNudge, checkNudge, isNudgeInstalled } from './nudge/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('worktale')
  .description('Zero-friction, local-first developer work journal')
  .version(pkg.version);

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
  .description('Sync today\'s digest to Worktale Cloud')
  .option('-w, --week', 'Generate and publish weekly digest')
  .action(async (options: { week?: boolean }) => {
    await publishCommand(options);
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
  .command('batch')
  .description('Scan for git repos and import history (no hooks)')
  .option('-d, --depth <n>', 'Max directory depth to search', '5')
  .option('-s, --since <period>', 'Only import commits from this period (e.g. 30d, 6w, 3m, 1y)')
  .option('-a, --annotate', 'Generate AI annotations for days lacking notes')
  .option('--auto', 'Auto-annotate all days without prompting (use with --annotate)')
  .option('--overwrite', 'Overwrite existing AI annotations (use with --annotate)')
  .action(async (options: { depth?: string; since?: string; annotate?: boolean; auto?: boolean; overwrite?: boolean }) => {
    await batchCommand(options);
  });

program
  .command('hook [action] [path]')
  .description('Manage git hooks (install, uninstall, status)')
  .action(async (action?: string, path?: string) => {
    await hookCommand(action, path);
  });

program
  .command('note [message]')
  .description('Append a note to today\'s work narrative')
  .action(async (message?: string) => {
    await noteCommand(message);
  });

program
  .command('capture')
  .description('Capture the latest commit (used by git hooks)')
  .option('-s, --silent', 'Suppress output')
  .action(async (options: { silent?: boolean }) => {
    await captureCommand(options);
  });

program
  .command('cloud [action]')
  .description('Manage Worktale Cloud account (signup, login, logout, status)')
  .action(async (action?: string) => {
    await cloudCommand(action);
  });

program
  .command('standup')
  .description('Generate a standup from recent activity')
  .option('-c, --copy', 'Copy to clipboard')
  .option('-f, --format <type>', 'Output format (slack)')
  .action(async (options: { copy?: boolean; format?: string }) => {
    await standupCommand(options);
  });

program
  .command('retro')
  .description('Generate a retrospective')
  .option('-d, --days <n>', 'Number of days to cover', '14')
  .option('-s, --since <date>', 'Start date')
  .action(async (options: { days?: string; since?: string }) => {
    await retroCommand(options);
  });

program
  .command('timeline')
  .description('View cross-repo timeline from cloud')
  .option('-s, --since <date>', 'Start from date')
  .action(async (options: { since?: string }) => {
    await timelineCommand(options);
  });

program
  .command('profile [action] [key] [value]')
  .description('View or update your cloud profile')
  .action(async (action?: string, key?: string, value?: string) => {
    await profileCommand(action, key, value);
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
      if (result.unsupported) {
        console.log('Nudge requires a Unix shell (macOS/Linux). Windows support coming soon.');
      } else if (result.installed) {
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
