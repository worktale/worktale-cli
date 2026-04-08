import { getDb } from './index.js';

export interface Commit {
  id: number;
  repo_id: number;
  sha: string;
  message: string | null;
  author: string | null;
  timestamp: string;
  lines_added: number;
  lines_removed: number;
  files_changed: number;
  branch: string | null;
  is_merge: number;
  tags: string | null;
}

export interface CommitInsert {
  repo_id: number;
  sha: string;
  message?: string | null;
  author?: string | null;
  timestamp: string;
  lines_added?: number;
  lines_removed?: number;
  files_changed?: number;
  branch?: string | null;
  is_merge?: boolean | number;
  tags?: string | null;
}

export function insertCommit(data: CommitInsert): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO commits (repo_id, sha, message, author, timestamp, lines_added, lines_removed, files_changed, branch, is_merge, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.repo_id,
    data.sha,
    data.message ?? null,
    data.author ?? null,
    data.timestamp,
    data.lines_added ?? 0,
    data.lines_removed ?? 0,
    data.files_changed ?? 0,
    data.branch ?? null,
    data.is_merge ? 1 : 0,
    data.tags ?? null,
  );

  return Number(result.lastInsertRowid);
}

export function insertCommitsBatch(repoId: number, commits: CommitInsert[]): void {
  const db = getDb();
  const BATCH_SIZE = 500;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO commits (repo_id, sha, message, author, timestamp, lines_added, lines_removed, files_changed, branch, is_merge, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBatch = db.transaction((batch: CommitInsert[]) => {
    for (const c of batch) {
      stmt.run(
        repoId,
        c.sha,
        c.message ?? null,
        c.author ?? null,
        c.timestamp,
        c.lines_added ?? 0,
        c.lines_removed ?? 0,
        c.files_changed ?? 0,
        c.branch ?? null,
        c.is_merge ? 1 : 0,
        c.tags ?? null,
      );
    }
  });

  for (let i = 0; i < commits.length; i += BATCH_SIZE) {
    const batch = commits.slice(i, i + BATCH_SIZE);
    insertBatch(batch);
  }
}

export function getCommitsByDate(repoId: number, date: string): Commit[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM commits
    WHERE repo_id = ? AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  `).all(repoId, `${date}T00:00:00`, `${date}T23:59:59.999`) as Commit[];
}

export function getCommitsByDateRange(repoId: number, startDate: string, endDate: string): Commit[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM commits
    WHERE repo_id = ? AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  `).all(repoId, `${startDate}T00:00:00`, `${endDate}T23:59:59.999`) as Commit[];
}

export function getRecentCommits(repoId: number, limit: number): Commit[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM commits
    WHERE repo_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(repoId, limit) as Commit[];
}

export function getCommitCount(repoId: number): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM commits WHERE repo_id = ?').get(repoId) as { count: number };
  return row.count;
}

export function getLatestCommitSha(repoId: number): string | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT sha FROM commits
    WHERE repo_id = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(repoId) as { sha: string } | undefined;
  return row?.sha ?? null;
}

export function commitExists(repoId: number, sha: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM commits WHERE repo_id = ? AND sha = ?').get(repoId, sha);
  return row !== undefined;
}

// Cross-repo queries (all-repos mode)

export interface CommitWithRepo extends Commit {
  repo_name: string;
}

export function getAllCommitsByDate(date: string): CommitWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, r.name as repo_name FROM commits c
    JOIN repos r ON r.id = c.repo_id
    WHERE c.timestamp >= ? AND c.timestamp < ?
    ORDER BY c.timestamp DESC
  `).all(`${date}T00:00:00`, `${date}T23:59:59.999`) as CommitWithRepo[];
}

export function getAllRecentCommits(limit: number): CommitWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, r.name as repo_name FROM commits c
    JOIN repos r ON r.id = c.repo_id
    ORDER BY c.timestamp DESC
    LIMIT ?
  `).all(limit) as CommitWithRepo[];
}

export function getAllCommitsByDateRange(startDate: string, endDate: string): CommitWithRepo[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, r.name as repo_name FROM commits c
    JOIN repos r ON r.id = c.repo_id
    WHERE c.timestamp >= ? AND c.timestamp < ?
    ORDER BY c.timestamp DESC
  `).all(`${startDate}T00:00:00`, `${endDate}T23:59:59.999`) as CommitWithRepo[];
}

export function getAllCommitCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM commits').get() as { count: number };
  return row.count;
}
