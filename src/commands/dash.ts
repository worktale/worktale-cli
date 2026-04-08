import chalk from 'chalk';
import { brandText, dimText } from '../tui/theme.js';
import { getRepo, getAllRepos } from '../db/repos.js';
import { closeDb } from '../db/index.js';
import { detectMode } from '../utils/mode.js';

export async function dashCommand(): Promise<void> {
  try {
    const mode = detectMode();

    if (mode.type === 'not-initialized') {
      console.log('');
      console.log('  ' + dimText('worktale:') + ' not initialized in this repo.');
      console.log('  Run ' + brandText('worktale init') + ' to get started.');
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    let repoPath: string | undefined;
    let multiRepo = false;
    let repoIds: number[] | undefined;

    if (mode.type === 'all-repos') {
      const repos = getAllRepos();
      if (repos.length === 0) {
        console.log('');
        console.log('  ' + dimText('worktale:') + ' no repos tracked yet.');
        console.log('  Run ' + brandText('worktale init') + ' in a repo or ' + brandText('worktale batch') + ' to scan.');
        console.log('');
        closeDb();
        process.exit(0);
        return;
      }
      multiRepo = true;
      repoIds = repos.map(r => r.id);
      console.log('');
      console.log('  ' + dimText('Showing all ' + repos.length + ' tracked repos'));
    } else {
      repoPath = mode.repoPath;
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
    }

    // Try to load and render the Ink TUI app
    try {
      const { render } = await import('ink');
      const React = await import('react');
      const { default: App } = await import('../tui/App.js');

      // Close DB before handing off to TUI (it will manage its own connection)
      closeDb();

      let pendingAction: 'digest' | 'publish' | null = null;
      const { waitUntilExit } = render(
        React.createElement(App, {
          repoPath,
          multiRepo,
          repoIds,
          onAction: (action: 'digest' | 'publish') => { pendingAction = action; },
        }),
      );
      await waitUntilExit();

      if (pendingAction === 'digest') {
        const { digestCommand } = await import('./digest.js');
        await digestCommand();
        return;
      }
      if (pendingAction === 'publish') {
        const { publishCommand } = await import('./publish.js');
        await publishCommand();
        return;
      }
    } catch {
      // If TUI import fails (e.g., App.tsx not yet built), fall back to today command
      closeDb();
      const { todayCommand } = await import('./today.js');
      await todayCommand();
      return;
    }

    process.exit(0);
  } catch (err: unknown) {
    // If TUI fails, fall back to showing today's output
    try {
      closeDb();
      const { todayCommand } = await import('./today.js');
      await todayCommand();
    } catch (fallbackErr: unknown) {
      console.error(chalk.red('  Error:'), fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
      closeDb();
      process.exit(1);
    }
  }
}
