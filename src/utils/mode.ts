import { existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'os';

export type WorktaleMode =
  | { type: 'single-repo'; repoPath: string }
  | { type: 'all-repos' }
  | { type: 'not-initialized' };

const DB_PATH = join(os.homedir(), '.worktale', 'data.db');

export function detectMode(): WorktaleMode {
  const cwd = process.cwd();
  if (existsSync(join(cwd, '.worktale', 'config.json'))) {
    return { type: 'single-repo', repoPath: cwd };
  }
  if (existsSync(DB_PATH)) {
    return { type: 'all-repos' };
  }
  return { type: 'not-initialized' };
}
