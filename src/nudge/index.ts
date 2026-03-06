import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { loadConfig } from '../config/index.js';
import { getDb } from '../db/index.js';
import { getDateString } from '../utils/formatting.js';

// Shell profiles to check
const SHELL_PROFILES = [
  '.bashrc',
  '.zshrc',
  '.bash_profile',
  '.profile',
];

const NUDGE_MARKER = '# Worktale nudge';
const NUDGE_LINE = '[ -x "$(command -v worktale)" ] && worktale nudge --check 2>/dev/null &';

export function installNudge(): { installed: boolean; profile: string | null } {
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

    // Check if there are any commits today across all repos
    const todayCommits = db.prepare(
      `SELECT SUM(commits_count) as total, SUM(lines_added) as lines
       FROM daily_summaries WHERE date = ?`
    ).get(today) as { total: number | null; lines: number | null } | undefined;

    if (!todayCommits?.total || todayCommits.total === 0) return;

    // Check if a digest has already been written today
    const hasDigest = db.prepare(
      `SELECT COUNT(*) as cnt FROM daily_summaries
       WHERE date = ? AND user_notes IS NOT NULL AND user_notes != ''`
    ).get(today) as { cnt: number };

    if (hasDigest.cnt > 0) return;

    // Show nudge
    const lines = todayCommits.lines ?? 0;
    console.log('');
    console.log(chalk.hex('#FBBF24')('  \u26A1 Worktale') + chalk.hex('#9CA3AF')(` \u2014 You shipped ${chalk.bold(lines.toLocaleString())} lines today. Want to log it?`));
    console.log(chalk.hex('#9CA3AF')('     Run: ') + chalk.hex('#00D4FF')('worktale digest'));
    console.log('');
  } catch {
    // Nudge should never throw or produce errors
  }
}

export function isNudgeInstalled(): boolean {
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
