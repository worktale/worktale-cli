import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import chalk from 'chalk';
import { banner, brandText, positiveText, dimText, streakText, secondaryText } from '../tui/theme.js';
import { getCurrentUserEmail } from '../git/log.js';
import { loadConfig, saveConfig } from '../config/index.js';
import { addRepo, getRepo } from '../db/repos.js';
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

/** Skip these directories during recursive scan — they never contain user repos. */
const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  '__pycache__',
  'bin',
  'obj',
  'packages',
  'dist',
  'build',
  'target',
  '.nuke',
  'venv',
  '.venv',
  'env',
]);

/**
 * Recursively find directories containing a .git folder.
 * Skips hidden directories and common build/dependency directories.
 * Calls onDir() for each directory visited so callers can show progress.
 */
function findGitRepos(
  startPath: string,
  maxDepth: number,
  onDir?: () => void,
): string[] {
  const repos: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    try {
      onDir?.();

      // Check if this directory is a git repo
      if (existsSync(join(dir, '.git'))) {
        repos.push(dir);
        // Don't recurse into git repos (submodules would have their own .git)
        return;
      }

      const entries = readdirSync(dir);
      for (const entry of entries) {
        // Skip hidden dirs and common build/dependency directories
        if (entry.startsWith('.') || SKIP_DIRS.has(entry)) {
          continue;
        }

        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, depth + 1);
          }
        } catch {
          // Skip inaccessible directories
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  walk(startPath, 0);
  return repos;
}

/**
 * Parse a human-friendly --since value into a git --since date string.
 * Accepts: "30d", "6w", "3m", "1y" or plain git date strings.
 */
function parseSinceValue(value: string): string {
  const match = value.match(/^(\d+)\s*([dwmy])$/i);
  if (!match) return value; // Pass through as-is (e.g., "2025-01-01")

  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'd': return `${num} days ago`;
    case 'w': return `${num * 7} days ago`;
    case 'm': return `${num} months ago`;
    case 'y': return `${num} years ago`;
    default: return value;
  }
}

export async function batchCommand(options: { depth?: string; since?: string } = {}): Promise<void> {
  try {
    const startPath = resolve(process.cwd());
    const maxDepth = parseInt(options.depth ?? '5', 10);
    const sinceRaw = options.since;
    const sinceGit = sinceRaw ? parseSinceValue(sinceRaw) : undefined;

    console.log('');
    console.log(banner());
    console.log('');
    console.log('  ' + brandText('Batch Mode') + '  ' + dimText('Scanning for git repos...'));
    console.log('  ' + dimText('Starting from:') + '  ' + startPath);
    console.log('  ' + dimText('Max depth:') + '  ' + maxDepth);
    if (sinceGit) {
      console.log('  ' + dimText('Since:') + '  ' + sinceGit);
    } else {
      console.log('  ' + dimText('Range:') + '  all time ' + chalk.yellow('(use --since to speed up, e.g. --since 6m)'));
    }
    console.log('');

    // Step 1: Find all git repos with scanning progress
    let dirsScanned = 0;
    const onDir = (): void => {
      dirsScanned++;
      if (dirsScanned % 50 === 0) {
        process.stdout.write(`\r  ${dimText('Scanning...')}  ${formatNumber(dirsScanned)} directories checked   `);
      }
    };

    const repoPaths = findGitRepos(startPath, maxDepth, onDir);

    // Clear scanning progress
    if (dirsScanned >= 50) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    }

    if (repoPaths.length === 0) {
      console.log('  ' + chalk.yellow('No git repositories found.'));
      console.log('');
      closeDb();
      process.exit(0);
      return;
    }

    console.log('  ' + positiveText(`Found ${repoPaths.length} repo${repoPaths.length === 1 ? '' : 's'}`) + dimText(` (scanned ${formatNumber(dirsScanned)} directories)`) + ':');
    console.log('');
    for (const repoPath of repoPaths) {
      console.log('    ' + dimText('\u2022') + '  ' + basename(repoPath) + '  ' + dimText(repoPath));
    }
    console.log('');

    // Step 2: Resolve user email
    const config = loadConfig();
    let userEmail = config.git.userEmailOverride || config.git.userEmail || '';

    if (!userEmail && repoPaths.length > 0) {
      // Try to get email from the first repo
      userEmail = await getCurrentUserEmail(repoPaths[0]);
      if (userEmail) {
        config.git.userEmail = userEmail;
        saveConfig(config);
      }
    }

    if (!userEmail) {
      console.log('  ' + chalk.yellow('Warning: No git user.email configured.'));
      console.log('  Batch will capture all commits. Set email with:');
      console.log('    ' + brandText('worktale config set git.userEmail "you@example.com"'));
      console.log('');
    }

    // Step 3: Process each repo
    let totalReposProcessed = 0;
    let totalCommits = 0;
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    const errors: { repo: string; error: string }[] = [];

    for (let i = 0; i < repoPaths.length; i++) {
      const repoPath = repoPaths[i];
      const repoName = basename(repoPath);
      const counter = dimText(`[${i + 1}/${repoPaths.length}]`);

      process.stdout.write(`  ${counter}  ${chalk.bold(repoName)}  `);

      try {
        // Register repo in DB (no hooks, no .worktale dir in repo)
        const repoId = addRepo(repoPath, repoName);

        // Run historical analysis
        let lastProgressLine = '';
        const onProgress = (progress: AnalysisProgress): void => {
          const label = `${formatNumber(progress.processed)} commits`;
          const line = renderProgressBar(progress.processed, progress.total, label);
          process.stdout.write('\r' + `  ${counter}  ${chalk.bold(repoName)}  ${line}   `);
          lastProgressLine = line;
        };

        const stats: AnalysisResult = await runAnalysis(repoPath, repoId, userEmail, onProgress, sinceGit);

        // Clear progress and show result
        if (lastProgressLine) {
          process.stdout.write('\r' + ' '.repeat(100) + '\r');
        }

        const added = positiveText(`+${formatNumber(stats.linesAdded)}`);
        const removed = chalk.red(`-${formatNumber(stats.linesRemoved)}`);
        console.log(`  ${counter}  ${chalk.bold(repoName)}  ${positiveText('\u2713')}  ${formatNumber(stats.totalCommits)} commits  ${added} / ${removed}`);

        totalReposProcessed++;
        totalCommits += stats.totalCommits;
        totalLinesAdded += stats.linesAdded;
        totalLinesRemoved += stats.linesRemoved;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(chalk.red('\u2717') + '  ' + dimText(msg));
        errors.push({ repo: repoName, error: msg });
      }
    }

    // Step 4: Summary
    console.log('');
    console.log('  ' + chalk.bold('Batch Summary'));
    console.log('  ' + dimText('\u2500'.repeat(40)));
    console.log('  Repos:        ' + chalk.bold(formatNumber(totalReposProcessed)));
    console.log('  Commits:      ' + chalk.bold(formatNumber(totalCommits)));
    console.log('  Lines added:  ' + positiveText('+' + formatNumber(totalLinesAdded)));
    console.log('  Lines removed:' + chalk.red(' -' + formatNumber(totalLinesRemoved)));

    if (errors.length > 0) {
      console.log('  Errors:       ' + chalk.red(String(errors.length)));
      for (const { repo, error } of errors) {
        console.log('    ' + chalk.red('\u2022') + '  ' + repo + ': ' + dimText(error));
      }
    }

    console.log('');
    console.log('  ' + streakText('\u26A1') + '  ' + chalk.bold('Batch scan complete!'));
    console.log('');
    console.log('  ' + secondaryText('No hooks were installed. Repos are tracked read-only.'));
    console.log('  ' + secondaryText('Run') + ' ' + brandText('worktale hook install') + ' ' + secondaryText('in any repo to add auto-capture.'));
    console.log('  ' + secondaryText('Run') + ' ' + brandText('worktale') + ' ' + secondaryText('to open the dashboard.'));
    console.log('');

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error('');
    console.error(chalk.red('  Error during batch scan:'), err instanceof Error ? err.message : String(err));
    console.error('');
    closeDb();
    process.exit(1);
  }
}
