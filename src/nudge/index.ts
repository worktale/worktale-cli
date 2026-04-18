import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { loadConfig } from '../config/index.js';
import { getDb } from '../db/index.js';
import { getDateString } from '../utils/formatting.js';
import { generateAndSaveDigest } from '../utils/digest-saver.js';

const isWindows = process.platform === 'win32';

// Shell profiles to check
const SHELL_PROFILES = [
  '.bashrc',
  '.zshrc',
  '.bash_profile',
  '.profile',
];

const NUDGE_MARKER = '# Worktale nudge';
const NUDGE_LINE = '[ -x "$(command -v worktale)" ] && worktale nudge --check 2>/dev/null &';

export function installNudge(): { installed: boolean; profile: string | null; unsupported?: boolean } {
  if (isWindows) {
    return { installed: false, profile: null, unsupported: true };
  }

  const home = homedir();

  for (const profile of SHELL_PROFILES) {
    const profilePath = join(home, profile);
    if (existsSync(profilePath)) {
      const content = readFileSync(profilePath, 'utf-8');
      if (content.includes(NUDGE_MARKER)) {
        return { installed: true, profile };
      }
      // Append nudge
      const suffix = content.endsWith('\n') ? '' : '\n';
      appendFileSync(profilePath, `${suffix}\n${NUDGE_MARKER}\n${NUDGE_LINE}\n`, 'utf-8');
      return { installed: true, profile };
    }
  }

  return { installed: false, profile: null };
}

export function removeNudge(): void {
  if (isWindows) return;

  const home = homedir();
  for (const profile of SHELL_PROFILES) {
    const profilePath = join(home, profile);
    if (existsSync(profilePath)) {
      const content = readFileSync(profilePath, 'utf-8');
      if (content.includes(NUDGE_MARKER)) {
        const lines = content.split('\n');
        const filtered = lines.filter(line =>
          !line.includes(NUDGE_MARKER) && !line.includes('worktale nudge --check')
        );
        writeFileSync(profilePath, filtered.join('\n'), 'utf-8');
      }
    }
  }
}

export function checkNudge(): void {
  // Note: the install/remove guards on Windows are intentional (bash profiles
  // don't exist), but checkNudge just reads the DB and prints — works on any
  // platform (WSL, Git Bash, PowerShell all run Node fine).
  try {
    const config = loadConfig();
    const now = new Date();
    const [nudgeHour, nudgeMinute] = config.nudgeTime.split(':').map(Number);

    // Only nudge if current time is past nudgeTime
    if (now.getHours() < nudgeHour || (now.getHours() === nudgeHour && now.getMinutes() < nudgeMinute)) {
      return;
    }

    const today = getDateString();
    const db = getDb();

    // Find every repo with commits today but no digest saved yet.
    // We need a per-repo breakdown (not a global count) so we can auto-generate
    // a distinct draft per repo when autoDigestOnNudge is enabled.
    const pending = db.prepare(
      `SELECT ds.repo_id, r.name AS repo_name,
              ds.commits_count AS commits, ds.lines_added AS lines
       FROM daily_summaries ds
       JOIN repos r ON r.id = ds.repo_id
       WHERE ds.date = ?
         AND ds.commits_count > 0
         AND (ds.user_notes IS NULL OR ds.user_notes = '')`
    ).all(today) as Array<{ repo_id: number; repo_name: string; commits: number; lines: number }>;



    if (pending.length === 0) return;

    const totalLines = pending.reduce((acc, r) => acc + (r.lines ?? 0), 0);

    // Auto-digest path: generate + save a template digest for each pending repo.
    // This closes the "I forgot to digest" gap — template mode is deterministic,
    // offline, and non-destructive (user_notes was empty). User can edit later.
    if (config.autoDigestOnNudge !== false) {
      const saved: string[] = [];
      for (const p of pending) {
        try {
          const body = generateAndSaveDigest(p.repo_id, today);
          if (body) saved.push(p.repo_name);
        } catch {
          // Per-repo failure shouldn't block the others or poison the shell.
        }
      }

      if (saved.length > 0) {
        const repoList = saved.length === 1 ? saved[0] : `${saved.length} repos`;
        console.log('');
        console.log(
          chalk.hex('#FBBF24')('  \u26A1 Worktale') +
          chalk.hex('#9CA3AF')(` \u2014 Auto-saved digest for ${chalk.bold(repoList)} (${totalLines.toLocaleString()} lines shipped today).`),
        );
        console.log(chalk.hex('#9CA3AF')('     Review or edit: ') + chalk.hex('#00D4FF')('worktale digest'));
        console.log('');
      }
      return;
    }

    // Legacy path: just remind the user to run digest manually.
    console.log('');
    console.log(chalk.hex('#FBBF24')('  \u26A1 Worktale') + chalk.hex('#9CA3AF')(` \u2014 You shipped ${chalk.bold(totalLines.toLocaleString())} lines today. Want to log it?`));
    console.log(chalk.hex('#9CA3AF')('     Run: ') + chalk.hex('#00D4FF')('worktale digest'));
    console.log('');
  } catch {
    // Nudge should never throw or produce errors
  }
}

export function isNudgeInstalled(): boolean {
  if (isWindows) return false;

  const home = homedir();
  for (const profile of SHELL_PROFILES) {
    const profilePath = join(home, profile);
    if (existsSync(profilePath)) {
      const content = readFileSync(profilePath, 'utf-8');
      if (content.includes(NUDGE_MARKER)) return true;
    }
  }
  return false;
}
