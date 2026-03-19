import { getDb } from './index.js';

export interface DailySummary {
  id: number;
  repo_id: number;
  date: string;
  commits_count: number;
  lines_added: number;
  lines_removed: number;
  files_touched: number;
  user_notes: string | null;
  ai_draft: string | null;
  published: number;
  published_at: string | null;
}

export interface DailySummaryUpsert {
  repo_id: number;
  date: string;
  commits_count?: number;
  lines_added?: number;
  lines_removed?: number;
  files_touched?: number;
  user_notes?: string | null;
  ai_draft?: string | null;
}

export function upsertDailySummary(data: DailySummaryUpsert): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO daily_summaries (repo_id, date, commits_count, lines_added, lines_removed, files_touched, user_notes, ai_draft)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repo_id, date) DO UPDATE SET
      commits_count = excluded.commits_count,
      lines_added   = excluded.lines_added,
      lines_removed = excluded.lines_removed,
      files_touched = excluded.files_touched,
      user_notes    = COALESCE(excluded.user_notes, daily_summaries.user_notes),
      ai_draft      = COALESCE(excluded.ai_draft, daily_summaries.ai_draft)
  `).run(
    data.repo_id,
    data.date,
    data.commits_count ?? 0,
    data.lines_added ?? 0,
    data.lines_removed ?? 0,
    data.files_touched ?? 0,
    data.user_notes ?? null,
    data.ai_draft ?? null,
  );
}

export function getDailySummary(repoId: number, date: string): DailySummary | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM daily_summaries WHERE repo_id = ? AND date = ?').get(repoId, date) as DailySummary | undefined;
}

export function getDailySummariesRange(repoId: number, startDate: string, endDate: string): DailySummary[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM daily_summaries
    WHERE repo_id = ? AND date >= ? AND date <= ?
    ORDER BY date ASC
  `).all(repoId, startDate, endDate) as DailySummary[];
}

export function getAllDailySummaries(repoId: number): DailySummary[] {
  const db = getDb();
  return db.prepare('SELECT * FROM daily_summaries WHERE repo_id = ? ORDER BY date ASC').all(repoId) as DailySummary[];
}

export function updateUserNotes(repoId: number, date: string, notes: string): void {
  const db = getDb();
  db.prepare('UPDATE daily_summaries SET user_notes = ? WHERE repo_id = ? AND date = ?').run(notes, repoId, date);
}

export function appendUserNotes(repoId: number, date: string, note: string): void {
  const db = getDb();
  const existing = getDailySummary(repoId, date);

  if (!existing) {
    // Create a daily_summaries row if none exists yet
    upsertDailySummary({ repo_id: repoId, date, user_notes: note });
    return;
  }

  const current = existing.user_notes?.trim() ?? '';
  const updated = current ? `${current}\n${note}` : note;
  db.prepare('UPDATE daily_summaries SET user_notes = ? WHERE repo_id = ? AND date = ?').run(updated, repoId, date);
}

export function updateAiDraft(repoId: number, date: string, draft: string): void {
  const db = getDb();
  db.prepare('UPDATE daily_summaries SET ai_draft = ? WHERE repo_id = ? AND date = ?').run(draft, repoId, date);
}

export function markPublished(repoId: number, date: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE daily_summaries SET published = 1, published_at = ? WHERE repo_id = ? AND date = ?').run(now, repoId, date);
}

export function getDatesNeedingAnnotation(repoId: number, overwrite: boolean): DailySummary[] {
  const db = getDb();
  if (overwrite) {
    return db.prepare(`
      SELECT * FROM daily_summaries
      WHERE repo_id = ? AND commits_count > 0
      ORDER BY date ASC
    `).all(repoId) as DailySummary[];
  }
  return db.prepare(`
    SELECT * FROM daily_summaries
    WHERE repo_id = ? AND commits_count > 0 AND (ai_draft IS NULL OR ai_draft = '')
    ORDER BY date ASC
  `).all(repoId) as DailySummary[];
}

export function getTodaySummary(repoId: number): DailySummary | undefined {
  const today = new Date().toISOString().slice(0, 10);
  return getDailySummary(repoId, today);
}
