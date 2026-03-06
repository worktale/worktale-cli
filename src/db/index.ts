import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';

let db: BetterSqlite3.Database | null = null;

const WORKTALE_DIR = path.join(os.homedir(), '.worktale');
const DB_PATH = path.join(WORKTALE_DIR, 'data.db');

export function getDbPath(): string {
  return DB_PATH;
}

export function getDb(): BetterSqlite3.Database {
  if (db) return db;

  // Ensure directory exists
  if (!fs.existsSync(WORKTALE_DIR)) {
    fs.mkdirSync(WORKTALE_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      path        TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      first_seen  TEXT,
      last_synced TEXT
    );

    CREATE TABLE IF NOT EXISTS commits (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id       INTEGER REFERENCES repos(id),
      sha           TEXT NOT NULL,
      message       TEXT,
      author        TEXT,
      timestamp     TEXT NOT NULL,
      lines_added   INTEGER DEFAULT 0,
      lines_removed INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0,
      branch        TEXT,
      is_merge      INTEGER DEFAULT 0,
      tags          TEXT,
      UNIQUE(repo_id, sha)
    );

    CREATE TABLE IF NOT EXISTS daily_summaries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id         INTEGER REFERENCES repos(id),
      date            TEXT NOT NULL,
      commits_count   INTEGER DEFAULT 0,
      lines_added     INTEGER DEFAULT 0,
      lines_removed   INTEGER DEFAULT 0,
      files_touched   INTEGER DEFAULT 0,
      user_notes      TEXT,
      ai_draft        TEXT,
      published       INTEGER DEFAULT 0,
      published_at    TEXT,
      UNIQUE(repo_id, date)
    );

    CREATE TABLE IF NOT EXISTS file_activity (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id   INTEGER REFERENCES repos(id),
      path      TEXT,
      module    TEXT,
      date      TEXT,
      changes   INTEGER DEFAULT 0
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_commits_repo_timestamp
      ON commits(repo_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_commits_repo_sha
      ON commits(repo_id, sha);

    CREATE INDEX IF NOT EXISTS idx_daily_summaries_repo_date
      ON daily_summaries(repo_id, date);

    CREATE INDEX IF NOT EXISTS idx_file_activity_repo_date
      ON file_activity(repo_id, date);

    CREATE INDEX IF NOT EXISTS idx_file_activity_repo_module
      ON file_activity(repo_id, module);
  `);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
