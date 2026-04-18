import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setupTestDb, teardownTestDb, getTestDb } from '../helpers/test-db.js';

vi.mock('../../src/db/index.js', () => ({
  getDb: () => getTestDb(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

import { sessionCommand } from '../../src/commands/session.js';
import { addRepo } from '../../src/db/repos.js';
import { getDailySummary } from '../../src/db/daily-summaries.js';
import { getAiSessionsByDate } from '../../src/db/ai-sessions.js';
import { getDateString } from '../../src/utils/formatting.js';

describe('sessionCommand', () => {
  let repoPath: string;
  const originalCwd = process.cwd;
  const logs: string[] = [];
  const capturedErrors: string[] = [];

  beforeEach(() => {
    setupTestDb();
    repoPath = mkdtempSync(join(tmpdir(), 'worktale-session-test-'));
    // Fake .git so auto-register path works
    mkdirSync(join(repoPath, '.git'), { recursive: true });
    process.cwd = () => repoPath;

    logs.length = 0;
    capturedErrors.length = 0;

    // Re-install mocks every test. afterEach's restoreAllMocks wipes them.
    vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined as never) as any);
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      capturedErrors.push(args.map(String).join(' '));
    });

    addRepo(repoPath, 'test-repo');
  });

  afterEach(() => {
    process.cwd = originalCwd;
    if (existsSync(repoPath)) rmSync(repoPath, { recursive: true, force: true });
    teardownTestDb();
    vi.restoreAllMocks();
  });

  describe('add', () => {
    it('records a session row with the supplied fields', async () => {
      await sessionCommand('add', {
        tool: 'claude-code',
        provider: 'anthropic',
        model: 'claude-opus-4-7',
        cost: '0.42',
        inputTokens: '12000',
        outputTokens: '2500',
        note: 'Fixed webhook race',
      });

      if (capturedErrors.length > 0) {
        throw new Error('session command errored: ' + capturedErrors.join(' | '));
      }

      const today = getDateString();
      const sessions = getAiSessionsByDate(1, today);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].tool).toBe('claude-code');
      expect(sessions[0].cost_usd).toBeCloseTo(0.42);
      expect(sessions[0].note).toBe('Fixed webhook race');
    });

    it('does NOT write to user_notes without --write-note', async () => {
      await sessionCommand('add', {
        tool: 'codex',
        note: 'Refactored auth flow',
      });

      const today = getDateString();
      const summary = getDailySummary(1, today);
      // Either no row yet or user_notes empty — both are acceptable "not written"
      expect(summary?.user_notes ?? '').toBe('');
    });

    it('appends the note to today\'s user_notes when --write-note is passed', async () => {
      await sessionCommand('add', {
        tool: 'claude-code',
        note: 'Switched from app-level locking to DB unique constraint',
        writeNote: true,
      });

      const today = getDateString();
      const summary = getDailySummary(1, today);
      expect(summary?.user_notes).toBeTruthy();
      expect(summary!.user_notes).toContain('Switched from app-level locking');
      expect(summary!.user_notes).toContain('[claude-code]');
    });

    it('appends to existing user_notes instead of overwriting', async () => {
      await sessionCommand('add', {
        tool: 'claude-code',
        note: 'First note of the day',
        writeNote: true,
      });
      await sessionCommand('add', {
        tool: 'claude-code',
        note: 'Second note later',
        writeNote: true,
      });

      const today = getDateString();
      const summary = getDailySummary(1, today);
      expect(summary!.user_notes).toContain('First note of the day');
      expect(summary!.user_notes).toContain('Second note later');
    });

    it('--write-note without --note is a no-op for user_notes', async () => {
      await sessionCommand('add', {
        tool: 'claude-code',
        writeNote: true,
      });

      const today = getDateString();
      const summary = getDailySummary(1, today);
      expect(summary?.user_notes ?? '').toBe('');
    });

    it('prints +note in the confirmation when the note was written', async () => {
      await sessionCommand('add', {
        tool: 'claude-code',
        note: 'Any note',
        writeNote: true,
      });

      const all = logs.join('\n');
      expect(all).toContain('+note');
    });
  });
});
