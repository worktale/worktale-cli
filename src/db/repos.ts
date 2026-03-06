import { getDb } from './index.js';

export interface Repo {
  id: number;
  path: string;
  name: string;
  first_seen: string | null;
  last_synced: string | null;
}

export function addRepo(repoPath: string, name: string): number {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO repos (path, name, first_seen, last_synced)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      last_synced = excluded.last_synced
  `);

  const result = stmt.run(repoPath, name, now, now);

  // If it was an update (rowsChanged but no lastInsertRowid change), fetch the existing id
  if (result.changes > 0 && result.lastInsertRowid === 0) {
    const existing = db.prepare('SELECT id FROM repos WHERE path = ?').get(repoPath) as { id: number } | undefined;
    return existing!.id;
  }

  return Number(result.lastInsertRowid);
}

export function getRepo(repoPath: string): Repo | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM repos WHERE path = ?').get(repoPath) as Repo | undefined;
}

export function getRepoById(id: number): Repo | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM repos WHERE id = ?').get(id) as Repo | undefined;
}

export function getAllRepos(): Repo[] {
  const db = getDb();
  return db.prepare('SELECT * FROM repos ORDER BY name').all() as Repo[];
}

export function removeRepo(repoId: number): void {
  const db = getDb();
  db.prepare('DELETE FROM file_activity WHERE repo_id = ?').run(repoId);
  db.prepare('DELETE FROM daily_summaries WHERE repo_id = ?').run(repoId);
  db.prepare('DELETE FROM commits WHERE repo_id = ?').run(repoId);
  db.prepare('DELETE FROM repos WHERE id = ?').run(repoId);
}

export function updateLastSynced(repoId: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE repos SET last_synced = ? WHERE id = ?').run(now, repoId);
}
