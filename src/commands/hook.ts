import { existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import chalk from 'chalk';
import { brandText, positiveText, dimText } from '../tui/theme.js';
import { installPostCommitHook, installPostPushHook, removeHooks, isHookInstalled } from '../git/hooks.js';
import { addRepo, getRepo } from '../db/repos.js';
import { closeDb } from '../db/index.js';

export async function hookCommand(action?: string, targetPath?: string): Promise<void> {
  try {
    const repoPath = resolve(targetPath ?? process.cwd());
    const repoName = basename(repoPath);

    // Validate git repo
    if (!existsSync(join(repoPath, '.git'))) {
      console.log('');
      console.log(chalk.red('  Error: Not a git repository.'));
      if (targetPath) {
        console.log('  ' + dimText(repoPath) + ' does not contain a .git directory.');
      } else {
        console.log('  Run this command from the root of a git repo, or pass a path:');
        console.log('    ' + brandText('worktale hook install /path/to/repo'));
      }
      console.log('');
      closeDb();
      process.exit(1);
      return;
    }

    if (action === 'install') {
      const alreadyInstalled = isHookInstalled(repoPath, 'post-commit');

      if (alreadyInstalled) {
        console.log('');
        console.log('  ' + dimText('Worktale hooks are already installed in') + ' ' + chalk.bold(repoName));
        console.log('');
        closeDb();
        process.exit(0);
        return;
      }

      // Auto-register the repo if it isn't tracked yet
      const existing = getRepo(repoPath);
      if (!existing) {
        const repoId = addRepo(repoPath, repoName);
        console.log('');
        console.log('  ' + chalk.yellow('Repo not tracked.') + '  Registering ' + chalk.bold(repoName) + dimText(` (id: ${repoId})`));
        console.log('  ' + dimText('Run') + ' ' + brandText('worktale init') + ' ' + dimText('or') + ' ' + brandText('worktale batch') + ' ' + dimText('to import commit history.'));
      }

      installPostCommitHook(repoPath);
      installPostPushHook(repoPath);

      console.log('');
      console.log('  ' + positiveText('\u2713') + '  Hooks installed in ' + chalk.bold(repoName));
      console.log('');
      console.log('  ' + dimText('Installed:'));
      console.log('    ' + dimText('\u2022') + '  post-commit  ' + dimText('(auto-captures commits)'));
      console.log('    ' + dimText('\u2022') + '  post-push    ' + dimText('(digest reminder)'));
      console.log('');
      console.log('  ' + dimText('To remove:') + ' ' + brandText('worktale hook uninstall'));
      console.log('');
    } else if (action === 'uninstall') {
      const hasHook = isHookInstalled(repoPath, 'post-commit');

      if (!hasHook) {
        console.log('');
        console.log('  ' + dimText('No Worktale hooks found in') + ' ' + chalk.bold(repoName));
        console.log('');
        closeDb();
        process.exit(0);
        return;
      }

      removeHooks(repoPath);

      console.log('');
      console.log('  ' + positiveText('\u2713') + '  Hooks removed from ' + chalk.bold(repoName));
      console.log('');
      console.log('  ' + dimText('Commits will no longer be auto-captured in this repo.'));
      console.log('  ' + dimText('To re-install:') + ' ' + brandText('worktale hook install'));
      console.log('');
    } else if (action === 'status') {
      const postCommit = isHookInstalled(repoPath, 'post-commit');
      const postPush = isHookInstalled(repoPath, 'post-push');

      console.log('');
      console.log('  ' + chalk.bold(repoName) + '  ' + dimText('hook status'));
      console.log('');
      console.log('    post-commit:  ' + (postCommit ? positiveText('installed') : dimText('not installed')));
      console.log('    post-push:    ' + (postPush ? positiveText('installed') : dimText('not installed')));
      console.log('');
    } else {
      // No action or unknown action — show help
      console.log('');
      console.log('  ' + chalk.bold('worktale hook') + '  ' + dimText('Manage git hooks'));
      console.log('');
      console.log('  ' + brandText('Commands:'));
      console.log('    ' + chalk.bold('install') + '   [path]  ' + dimText('Install post-commit & post-push hooks'));
      console.log('    ' + chalk.bold('uninstall') + ' [path]  ' + dimText('Remove Worktale hooks (preserves other hooks)'));
      console.log('    ' + chalk.bold('status') + '    [path]  ' + dimText('Check if hooks are installed'));
      console.log('');
      console.log('  ' + dimText('Examples:'));
      console.log('    ' + dimText('worktale hook install'));
      console.log('    ' + dimText('worktale hook install /path/to/repo'));
      console.log('    ' + dimText('worktale hook uninstall'));
      console.log('    ' + dimText('worktale hook status'));
      console.log('');
    }

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error('');
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    console.error('');
    closeDb();
    process.exit(1);
  }
}
