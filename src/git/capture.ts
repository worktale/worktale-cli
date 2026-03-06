import chalk from 'chalk';
import { getLatestCommit, getCurrentBranch } from './log.js';
import type { GitCommitData } from './log.js';
import { getRepo } from '../db/repos.js';
import { commitExists, insertCommit } from '../db/commits.js';
import { upsertDailySummary, getDailySummary } from '../db/daily-summaries.js';
import { getDb } from '../db/index.js';

/**
 * Classify a file path into a module/area name.
 * This is a simple built-in classifier. If utils/modules.ts provides
 * a more sophisticated one in the future, this can be swapped out.
 */
function classifyModule(filePath: string): string {
  const lower = filePath.toLowerCase();

  if (lower.startsWith('src/')) {
    const parts = lower.split('/');
    // Use the first directory under src/ as the module
    if (parts.length >= 3) return parts[1];
    return 'src';
  }
  if (lower.startsWith('test') || lower.startsWith('__test')) return 'tests';
  if (lower.startsWith('docs/') || lower.startsWith('doc/')) return 'docs';
  if (lower.startsWith('.github/') || lower.startsWith('.gitlab/')) return 'ci';
  if (lower.startsWith('scripts/') || lower.startsWith('bin/')) return 'scripts';
  if (
    lower === 'package.json' ||
    lower === 'tsconfig.json' ||
    lower.endsWith('.config.js') ||
    lower.endsWith('.config.ts') ||
    lower.startsWith('.')
  ) {
    return 'config';
  }

  // Fallback: use the directory name if there is one, otherwise 'root'
  const slashIdx = filePath.indexOf('/');
  if (slashIdx > 0) return filePath.slice(0, slashIdx).toLowerCase();
  return 'root';
}

export async function captureLatestCommit(
  repoPath: string,
  silent?: boolean,
): Promise<void> {
  try {
    // Get repo from DB — skip if not initialized
    const repo = getRepo(repoPath);
    if (!repo) return;

    // Get latest commit
    const commit = await getLatestCommit(repoPath);
    if (!commit) return;

    // Fill in branch if not provided by the log format
    if (!commit.branch) {
      commit.branch = await getCurrentBranch(repoPath);
    }

    // Check if already captured
    if (commitExists(repo.id, commit.sha)) return;

    // Capture
    captureCommitData(repo.id, commit);

    // Print confirmation if not silent
    if (!silent) {
      const added = chalk.green(`+${commit.linesAdded}`);
      const removed = chalk.red(`-${commit.linesRemoved}`);
      const msg =
        commit.message.length > 50
          ? commit.message.slice(0, 47) + '...'
          : commit.message;
      console.log(
        `  ${chalk.yellow('\u26A1')} ${chalk.dim('worktale:')} captured "${msg}" (${added} / ${removed})`,
      );
    }
  } catch {
    // Silently swallow all errors — the hook must never fail
  }
}

export function captureCommitData(
  repoId: number,
  commitData: GitCommitData,
): void {
  try {
    // Insert the commit
    insertCommit({
      repo_id: repoId,
      sha: commitData.sha,
      message: commitData.message,
      author: commitData.author,
      timestamp: commitData.timestamp,
      lines_added: commitData.linesAdded,
      lines_removed: commitData.linesRemoved,
      files_changed: commitData.filesChanged,
      branch: commitData.branch,
      is_merge: commitData.isMerge ? 1 : 0,
      tags: commitData.tags.length > 0 ? commitData.tags.join(',') : null,
    });

    // Extract the date portion (YYYY-MM-DD) from the ISO timestamp
    const date = commitData.timestamp.slice(0, 10);

    // Upsert daily summary — accumulate onto existing values
    const existing = getDailySummary(repoId, date);

    upsertDailySummary({
      repo_id: repoId,
      date,
      commits_count: (existing?.commits_count ?? 0) + 1,
      lines_added: (existing?.lines_added ?? 0) + commitData.linesAdded,
      lines_removed: (existing?.lines_removed ?? 0) + commitData.linesRemoved,
      files_touched: (existing?.files_touched ?? 0) + commitData.filesChanged,
    });

    // Insert file_activity records
    if (commitData.filePaths.length > 0) {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO file_activity (repo_id, path, module, date, changes)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertFiles = db.transaction((files: string[]) => {
        for (const filePath of files) {
          const module = classifyModule(filePath);
          stmt.run(repoId, filePath, module, date, 1);
        }
      });

      insertFiles(commitData.filePaths);
    }
  } catch {
    // Silently swallow DB errors — the hook must never fail
  }
}
