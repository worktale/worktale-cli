import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { banner, brandText, positiveText, dimText, streakText, secondaryText } from '../tui/theme.js';
import { installNudge } from '../nudge/index.js';
import { getCurrentUserEmail } from '../git/log.js';
import { loadConfig, saveConfig, ensureRepoWorktaleDir, saveRepoConfig } from '../config/index.js';
import { addRepo, getRepo } from '../db/repos.js';
import { getCommitCount } from '../db/commits.js';
import { installPostCommitHook } from '../git/hooks.js';
import { runAnalysis } from '../workers/run-analysis.js';
import type { AnalysisProgress, AnalysisResult } from '../workers/run-analysis.js';
import { closeDb } from '../db/index.js';
import { formatNumber } from '../utils/formatting.js';

function renderProgressBar(current: number, total: number, label: string): string {
  const width = 24;
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  const percent = Math.round(pct * 100);
  return `  ${bar}  ${label}  [${percent}%]`;
}

function promptEnter(question: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, () => {
      rl.close();
      resolve();
    });
  });
}

export async function initCommand(options: { global?: boolean } = {}): Promise<void> {
  try {
    if (options.global) {
      console.log('');
      console.log(banner());
      console.log('');
      console.log('  ' + brandText('Global nudge setup'));
      console.log('');

      const nudgeResult = installNudge();
      if (nudgeResult.installed) {
        console.log('  ' + positiveText('\u2713') + '  Nudge installed to ~/' + nudgeResult.profile);
      } else {
        console.log('  ' + dimText('No shell profile found. Create a .bashrc or .zshrc first.'));
      }
      console.log('');
      console.log('  To customize your nudge time:');
      console.log('     ' + dimText('worktale config set nudgeTime "17:00"'));
      console.log('');
      console.log('  Run ' + brandText('worktale config') + ' to see all settings.');
      console.log('');
      process.exit(0);
      return;
    }

    const repoPath = process.cwd();

    // Step 1: Check we're in a git repo
    if (!existsSync(join(repoPath, '.git'))) {
      console.log('');
      console.log(chalk.red('  Error: Not a git repository.'));
      console.log('  Run ' + brandText('worktale init') + ' from the root of a git repo.');
      console.log('');
      process.exit(1);
      return;
    }

    // Step 2: Print the banner
    console.log('');
    console.log(banner());
    console.log('');

    // Step 3: Show repo name and git detection
    const repoName = basename(repoPath);
    console.log('  ' + chalk.bold(repoName) + '  ' + positiveText('git detected \u2713'));
    console.log('');

    // Step 4: Resolve current user email
    const userEmail = await getCurrentUserEmail(repoPath);
    if (userEmail) {
      console.log('  ' + dimText('User:') + '  ' + userEmail);
    } else {
      console.log('  ' + chalk.yellow('Warning: No git user.email configured.'));
      console.log('  Run: git config user.email "you@example.com"');
    }

    // Step 5: Save user email to global config
    const config = loadConfig();
    if (userEmail && !config.git.userEmail) {
      config.git.userEmail = userEmail;
      saveConfig(config);
    }

    // Step 6: Register repo in DB
    const repoId = addRepo(repoPath, repoName);
    console.log('  ' + dimText('Repo ID:') + '  ' + repoId);
    console.log('');

    // Step 7: Create .worktale/ directory and config.json in repo
    ensureRepoWorktaleDir(repoPath);
    saveRepoConfig(repoPath, {
      repoId,
      initialized: true,
      lastAnalysis: null,
    });
    console.log('  ' + positiveText('\u2713') + '  .worktale/ directory created');

    // Step 8: Install post-commit hook
    installPostCommitHook(repoPath);
    console.log('  ' + positiveText('\u2713') + '  Post-commit hook installed');
    console.log('');

    // Step 9: Kick off historical analysis with progress display
    console.log('  ' + brandText('Analyzing git history...'));
    console.log('');

    let lastProgressLine = '';
    const onProgress = (progress: AnalysisProgress): void => {
      const label = `${formatNumber(progress.processed)} commits`;
      const line = renderProgressBar(progress.processed, progress.total, label);
      process.stdout.write('\r' + line + '   ');
      lastProgressLine = line;
    };

    const emailToUse = config.git.userEmailOverride || userEmail || '';
    const stats: AnalysisResult = await runAnalysis(repoPath, repoId, emailToUse, onProgress);

    // Clear progress line
    if (lastProgressLine) {
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }

    // Update repo config with analysis timestamp
    saveRepoConfig(repoPath, {
      repoId,
      initialized: true,
      lastAnalysis: new Date().toISOString(),
    });

    // Step 10: Show summary stats
    console.log('  ' + positiveText('\u2713') + '  Analysis complete!');
    console.log('');
    console.log('  ' + chalk.bold('Summary'));
    console.log('  ' + dimText('\u2500'.repeat(40)));
    console.log('  Commits:      ' + chalk.bold(formatNumber(stats.totalCommits)));
    console.log('  Lines added:  ' + positiveText('+' + formatNumber(stats.linesAdded)));
    console.log('  Lines removed:' + chalk.red(' -' + formatNumber(stats.linesRemoved)));
    console.log('  Files tracked:' + '  ' + formatNumber(stats.filesTracked));
    console.log('  Branches:     ' + formatNumber(stats.branchCount));
    console.log('  Days active:  ' + formatNumber(stats.daysActive));

    if (stats.firstCommitDate) {
      const firstDate = new Date(stats.firstCommitDate);
      const dateStr = firstDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      console.log('  First commit: ' + dateStr);
    }

    console.log('');
    console.log('  ' + streakText('\u26A1') + '  ' + chalk.bold('Worktale is ready!'));
    console.log('');
    console.log('  ' + secondaryText('Your commits will be captured automatically.'));
    console.log('  ' + secondaryText('Run') + ' ' + brandText('worktale') + ' ' + secondaryText('to open the dashboard.'));
    console.log('  ' + secondaryText('Run') + ' ' + brandText('worktale digest') + ' ' + secondaryText('to generate a daily summary.'));
    console.log('');

    // Step 11: Prompt to open dashboard
    await promptEnter('  Press ENTER to open dashboard...');

    closeDb();

    // Import and run dash command
    const { dashCommand } = await import('./dash.js');
    await dashCommand();
  } catch (err: unknown) {
    console.error('');
    console.error(chalk.red('  Error during init:'), err instanceof Error ? err.message : String(err));
    console.error('');
    closeDb();
    process.exit(1);
  }
}
