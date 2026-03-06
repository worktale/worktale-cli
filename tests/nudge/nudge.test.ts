import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

// Create a unique temp directory for each test run.
let tempHome: string;

// Mock os.homedir() so the nudge module uses our temp directory.
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => tempHome,
  };
});

// Mock the db module so checkNudge can query the in-memory test db.
vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: () => {},
  getDbPath: () => ':memory:',
}));

import {
  installNudge,
  removeNudge,
  checkNudge,
  isNudgeInstalled,
} from '../../src/nudge/index.js';

describe('nudge', () => {
  beforeEach(() => {
    tempHome = join(tmpdir(), `worktale-nudge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempHome, { recursive: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tempHome, { recursive: true, force: true });
  });

  // ---------- installNudge ----------

  describe('installNudge', () => {
    it('installs nudge into existing .bashrc', () => {
      writeFileSync(join(tempHome, '.bashrc'), '# my bashrc\n', 'utf-8');

      const result = installNudge();

      expect(result.installed).toBe(true);
      expect(result.profile).toBe('.bashrc');

      const content = readFileSync(join(tempHome, '.bashrc'), 'utf-8');
      expect(content).toContain('# Worktale nudge');
      expect(content).toContain('worktale nudge --check');
    });

    it('installs nudge into .zshrc if .bashrc does not exist', () => {
      writeFileSync(join(tempHome, '.zshrc'), '# my zshrc\n', 'utf-8');

      const result = installNudge();

      expect(result.installed).toBe(true);
      expect(result.profile).toBe('.zshrc');
    });

    it('does not duplicate nudge if already installed', () => {
      writeFileSync(join(tempHome, '.bashrc'), '# my bashrc\n# Worktale nudge\n[ -x "$(command -v worktale)" ] && worktale nudge --check 2>/dev/null &\n', 'utf-8');

      const result = installNudge();

      expect(result.installed).toBe(true);
      expect(result.profile).toBe('.bashrc');

      const content = readFileSync(join(tempHome, '.bashrc'), 'utf-8');
      const matches = content.match(/# Worktale nudge/g);
      expect(matches).toHaveLength(1);
    });

    it('returns not installed when no shell profile exists', () => {
      const result = installNudge();

      expect(result.installed).toBe(false);
      expect(result.profile).toBeNull();
    });

    it('handles profile without trailing newline', () => {
      writeFileSync(join(tempHome, '.bashrc'), '# no trailing newline', 'utf-8');

      const result = installNudge();

      expect(result.installed).toBe(true);
      const content = readFileSync(join(tempHome, '.bashrc'), 'utf-8');
      expect(content).toContain('# Worktale nudge');
      // Original content should be intact
      expect(content).toContain('# no trailing newline');
    });
  });

  // ---------- isNudgeInstalled ----------

  describe('isNudgeInstalled', () => {
    it('returns true when nudge marker is in a shell profile', () => {
      writeFileSync(join(tempHome, '.bashrc'), '# Worktale nudge\n', 'utf-8');

      expect(isNudgeInstalled()).toBe(true);
    });

    it('returns false when no profile contains nudge marker', () => {
      writeFileSync(join(tempHome, '.bashrc'), '# plain bashrc\n', 'utf-8');

      expect(isNudgeInstalled()).toBe(false);
    });

    it('returns false when no shell profiles exist', () => {
      expect(isNudgeInstalled()).toBe(false);
    });
  });

  // ---------- removeNudge ----------

  describe('removeNudge', () => {
    it('removes nudge lines from shell profile', () => {
      const original = '# my bashrc\nexport PATH=/usr/bin\n\n# Worktale nudge\n[ -x "$(command -v worktale)" ] && worktale nudge --check 2>/dev/null &\n';
      writeFileSync(join(tempHome, '.bashrc'), original, 'utf-8');

      removeNudge();

      const content = readFileSync(join(tempHome, '.bashrc'), 'utf-8');
      expect(content).not.toContain('# Worktale nudge');
      expect(content).not.toContain('worktale nudge --check');
      expect(content).toContain('export PATH=/usr/bin');
    });

    it('does nothing when nudge is not installed', () => {
      const original = '# my bashrc\n';
      writeFileSync(join(tempHome, '.bashrc'), original, 'utf-8');

      removeNudge();

      const content = readFileSync(join(tempHome, '.bashrc'), 'utf-8');
      expect(content).toBe(original);
    });

    it('removes nudge from multiple profiles if present', () => {
      const withNudge = '# profile\n# Worktale nudge\n[ -x "$(command -v worktale)" ] && worktale nudge --check 2>/dev/null &\n';
      writeFileSync(join(tempHome, '.bashrc'), withNudge, 'utf-8');
      writeFileSync(join(tempHome, '.zshrc'), withNudge, 'utf-8');

      removeNudge();

      expect(readFileSync(join(tempHome, '.bashrc'), 'utf-8')).not.toContain('# Worktale nudge');
      expect(readFileSync(join(tempHome, '.zshrc'), 'utf-8')).not.toContain('# Worktale nudge');
    });
  });

  // ---------- checkNudge ----------

  describe('checkNudge', () => {
    beforeEach(() => {
      setupTestDb();
      // Ensure .worktale dir exists for config
      mkdirSync(join(tempHome, '.worktale'), { recursive: true });
      writeFileSync(
        join(tempHome, '.worktale', 'config.json'),
        JSON.stringify({ nudgeTime: '17:00' }),
        'utf-8',
      );
    });

    afterEach(() => {
      teardownTestDb();
    });

    it('shows nudge when time is past nudgeTime and commits exist without digest', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 6, 18, 0, 0)); // 6pm, past 5pm nudge

      const db = getTestDb();
      // Seed a repo and daily summary with commits but no user_notes
      db.prepare("INSERT INTO repos (path, name) VALUES (?, ?)").run('/test-repo', 'test-repo');
      db.prepare(
        "INSERT INTO daily_summaries (repo_id, date, commits_count, lines_added) VALUES (?, ?, ?, ?)"
      ).run(1, '2026-03-06', 5, 200);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      checkNudge();

      expect(consoleSpy).toHaveBeenCalled();
      const allOutput = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(allOutput).toContain('Worktale');
      expect(allOutput).toContain('worktale digest');

      consoleSpy.mockRestore();
    });

    it('is silent when time is before nudgeTime', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 6, 10, 0, 0)); // 10am, before 5pm nudge

      const db = getTestDb();
      db.prepare("INSERT INTO repos (path, name) VALUES (?, ?)").run('/test-repo', 'test-repo');
      db.prepare(
        "INSERT INTO daily_summaries (repo_id, date, commits_count, lines_added) VALUES (?, ?, ?, ?)"
      ).run(1, '2026-03-06', 5, 200);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      checkNudge();

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('is silent when no commits exist today', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 6, 18, 0, 0));

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      checkNudge();

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('is silent when digest has already been written', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 2, 6, 18, 0, 0));

      const db = getTestDb();
      db.prepare("INSERT INTO repos (path, name) VALUES (?, ?)").run('/test-repo', 'test-repo');
      db.prepare(
        "INSERT INTO daily_summaries (repo_id, date, commits_count, lines_added, user_notes) VALUES (?, ?, ?, ?, ?)"
      ).run(1, '2026-03-06', 5, 200, 'I built the new feature today.');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      checkNudge();

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
