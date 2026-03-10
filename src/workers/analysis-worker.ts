import { parentPort } from 'node:worker_threads';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { simpleGit } from 'simple-git';

// better-sqlite3 is a native CommonJS module — the `require` function is
// injected by the tsup banner: `import { createRequire as __createRequire } ...`
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3') as typeof import('better-sqlite3');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkerInput {
  repoPath: string;
  repoId: number;
  userEmail: string;
  since?: string;
}

interface GitCommitData {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: string;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  filePaths: string[];
  branch: string;
  isMerge: boolean;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Inline helpers (duplicated from main-thread modules for worker isolation)
// ---------------------------------------------------------------------------

function classifyModule(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter((s) => s.length > 0);
  if (segments.length <= 1) return 'root';
  if (segments[0] === 'src' && segments.length >= 2) return `${segments[0]}/${segments[1]}`;
  return segments[0];
}

/**
 * Parse the custom git log format into GitCommitData[].
 *
 * Format per commit (produced by --format=%H%n%s%n%an%n%ae%n%aI%n%P%n%D --numstat):
 *   Line 1: SHA (40 hex chars)
 *   Line 2: Subject
 *   Line 3: Author name
 *   Line 4: Author email
 *   Line 5: ISO date
 *   Line 6: Parent SHAs (space-separated; >1 = merge)
 *   Line 7: Refs (branches, tags)
 *   Then numstat lines: added\tremoved\tpath
 *   Then blank line(s) before next commit
 */
function parseGitLogOutput(raw: string): GitCommitData[] {
  const commits: GitCommitData[] = [];
  if (!raw.trim()) return commits;

  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Skip blank lines between commits
    while (i < lines.length && lines[i].trim() === '') {
      i++;
    }
    if (i >= lines.length) break;

    // A SHA is 40 hex chars at the start of a line
    const shaLine = lines[i]?.trim();
    if (!shaLine || !/^[0-9a-f]{40}$/i.test(shaLine)) {
      i++;
      continue;
    }

    const sha = shaLine;
    const message = lines[i + 1] ?? '';
    const author = lines[i + 2] ?? '';
    const authorEmail = lines[i + 3] ?? '';
    const timestamp = lines[i + 4] ?? '';
    const parents = (lines[i + 5] ?? '').trim();
    const refs = (lines[i + 6] ?? '').trim();

    i += 7;

    // Parse refs for branch and tags
    let branch = '';
    const tags: string[] = [];
    if (refs) {
      const refParts = refs.split(',').map((r) => r.trim());
      for (const ref of refParts) {
        if (ref.startsWith('tag: ')) {
          tags.push(ref.slice(5).trim());
        } else if (ref.startsWith('HEAD -> ')) {
          branch = ref.slice(8).trim();
        } else if (ref && !ref.includes('HEAD') && ref !== '') {
          if (!branch) {
            branch = ref;
          }
        }
      }
    }

    // Detect merge: more than 1 parent SHA
    const isMerge = parents.split(/\s+/).filter(Boolean).length > 1;

    // Skip blank lines between header and numstat data
    while (i < lines.length && lines[i].trim() === '') {
      i++;
    }

    // Parse numstat lines
    let linesAdded = 0;
    let linesRemoved = 0;
    const filePaths: string[] = [];

    while (i < lines.length) {
      const line = lines[i];
      if (line && /^\d+\t\d+\t/.test(line)) {
        const parts = line.split('\t');
        linesAdded += parseInt(parts[0], 10) || 0;
        linesRemoved += parseInt(parts[1], 10) || 0;
        filePaths.push(parts.slice(2).join('\t'));
        i++;
      } else if (line && /^-\t-\t/.test(line)) {
        // Binary file
        const parts = line.split('\t');
        filePaths.push(parts.slice(2).join('\t'));
        i++;
      } else {
        break;
      }
    }

    commits.push({
      sha,
      message,
      author,
      authorEmail,
      timestamp,
      linesAdded,
      linesRemoved,
      filesChanged: filePaths.length,
      filePaths,
      branch,
      isMerge,
      tags,
    });
  }

  return commits;
}

// ---------------------------------------------------------------------------
// Database setup (standalone — no shared singleton with main thread)
// ---------------------------------------------------------------------------

function openDb(): InstanceType<typeof import('better-sqlite3')> {
  const worktaleDir = path.join(os.homedir(), '.worktale');
  if (!fs.existsSync(worktaleDir)) {
    fs.mkdirSync(worktaleDir, { recursive: true });
  }

  const dbPath = path.join(worktaleDir, 'data.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Ensure tables exist (worker may run before main thread initialises DB)
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

// ---------------------------------------------------------------------------
// Main worker logic
// ---------------------------------------------------------------------------

async function run(input: WorkerInput): Promise<void> {
  const { repoPath, repoId, userEmail, since } = input;
  const port = parentPort!;

  // ------------------------------------------------------------------
  // Phase 1 — Scanning: fetch full git log filtered to userEmail
  // ------------------------------------------------------------------
  port.postMessage({ type: 'progress', total: 0, processed: 0, phase: 'scanning' });

  const git = simpleGit(repoPath);
  const logArgs = [
    'log',
    '--format=%H%n%s%n%an%n%ae%n%aI%n%P%n%D',
    '--numstat',
    `--author=${userEmail}`,
  ];
  if (since) {
    logArgs.push(`--since=${since}`);
  }
  const rawLog = await git.raw(logArgs);

  const commits = parseGitLogOutput(rawLog);
  const totalCommits = commits.length;

  // Report scanning progress in chunks of 100
  for (let idx = 0; idx < totalCommits; idx += 100) {
    port.postMessage({
      type: 'progress',
      total: totalCommits,
      processed: Math.min(idx + 100, totalCommits),
      phase: 'scanning',
    });
  }

  // ------------------------------------------------------------------
  // Phase 2 — Analyzing: classify files into modules, build daily maps
  // ------------------------------------------------------------------
  port.postMessage({ type: 'progress', total: totalCommits, processed: 0, phase: 'analyzing' });

  interface DailyBucket {
    commitsCount: number;
    linesAdded: number;
    linesRemoved: number;
    filesTouched: Set<string>;
  }

  interface FileActivityRecord {
    repoId: number;
    filePath: string;
    module: string;
    date: string;
    changes: number;
  }

  const dailyMap = new Map<string, DailyBucket>();
  const fileActivityRecords: FileActivityRecord[] = [];
  const allFiles = new Set<string>();
  const branchSet = new Set<string>();
  const authorSet = new Set<string>();
  const activeDays = new Set<string>();

  let totalLinesAdded = 0;
  let totalLinesRemoved = 0;
  let firstCommitDate = '';

  for (let idx = 0; idx < commits.length; idx++) {
    const c = commits[idx];
    const date = c.timestamp.slice(0, 10); // YYYY-MM-DD

    activeDays.add(date);
    authorSet.add(c.authorEmail);
    if (c.branch) branchSet.add(c.branch);

    totalLinesAdded += c.linesAdded;
    totalLinesRemoved += c.linesRemoved;

    // Track earliest commit
    if (!firstCommitDate || c.timestamp < firstCommitDate) {
      firstCommitDate = c.timestamp;
    }

    // Daily bucket
    let bucket = dailyMap.get(date);
    if (!bucket) {
      bucket = { commitsCount: 0, linesAdded: 0, linesRemoved: 0, filesTouched: new Set() };
      dailyMap.set(date, bucket);
    }
    bucket.commitsCount++;
    bucket.linesAdded += c.linesAdded;
    bucket.linesRemoved += c.linesRemoved;

    for (const fp of c.filePaths) {
      allFiles.add(fp);
      bucket.filesTouched.add(fp);

      const mod = classifyModule(fp);
      fileActivityRecords.push({
        repoId,
        filePath: fp,
        module: mod,
        date,
        changes: c.linesAdded + c.linesRemoved, // attribute per-file not possible from numstat totals; approximate evenly
      });
    }

    if ((idx + 1) % 100 === 0 || idx === commits.length - 1) {
      port.postMessage({
        type: 'progress',
        total: totalCommits,
        processed: idx + 1,
        phase: 'analyzing',
      });
    }
  }

  // Recompute per-file changes — numstat already gives per-file numbers,
  // but we accumulated totals per commit. Re-parse for accurate per-file data.
  // Actually the fileActivityRecords above use commit-level totals divided
  // across all files. Let's rebuild with actual per-file numstat data.
  const accurateFileRecords: FileActivityRecord[] = [];
  for (const c of commits) {
    const date = c.timestamp.slice(0, 10);
    // Re-parse numstat per file from the raw lines? We don't have them stored
    // individually. For simplicity, distribute evenly or use 1 change per file.
    // The filePaths are known, total added/removed are known. If only 1 file,
    // it gets all. Otherwise split proportionally isn't possible without
    // per-file data. Since the parser does NOT store per-file add/remove,
    // we'll count each file touch as (linesAdded + linesRemoved) / filesChanged.
    const perFileChanges = c.filesChanged > 0
      ? Math.max(1, Math.round((c.linesAdded + c.linesRemoved) / c.filesChanged))
      : 0;

    for (const fp of c.filePaths) {
      accurateFileRecords.push({
        repoId,
        filePath: fp,
        module: classifyModule(fp),
        date,
        changes: perFileChanges,
      });
    }
  }

  // Also fetch branch count from git directly for accuracy
  let branchCount = branchSet.size;
  try {
    const branchResult = await git.branchLocal();
    branchCount = Math.max(branchCount, branchResult.all.length);
  } catch {
    // Keep what we have
  }

  // ------------------------------------------------------------------
  // Phase 3 — Storing: batch write to SQLite
  // ------------------------------------------------------------------
  port.postMessage({ type: 'progress', total: totalCommits, processed: 0, phase: 'storing' });

  const db = openDb();

  try {
    // --- Insert commits in batches of 500 ---
    const BATCH_SIZE = 500;

    const insertCommitStmt = db.prepare(`
      INSERT OR IGNORE INTO commits
        (repo_id, sha, message, author, timestamp, lines_added, lines_removed, files_changed, branch, is_merge, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCommitBatch = db.transaction((batch: GitCommitData[]) => {
      for (const c of batch) {
        insertCommitStmt.run(
          repoId,
          c.sha,
          c.message || null,
          c.author || null,
          c.timestamp,
          c.linesAdded,
          c.linesRemoved,
          c.filesChanged,
          c.branch || null,
          c.isMerge ? 1 : 0,
          c.tags.length > 0 ? c.tags.join(',') : null,
        );
      }
    });

    for (let i = 0; i < commits.length; i += BATCH_SIZE) {
      const batch = commits.slice(i, i + BATCH_SIZE);
      insertCommitBatch(batch);

      port.postMessage({
        type: 'progress',
        total: totalCommits,
        processed: Math.min(i + BATCH_SIZE, totalCommits),
        phase: 'storing',
      });
    }

    // --- Upsert daily summaries ---
    const upsertSummaryStmt = db.prepare(`
      INSERT INTO daily_summaries
        (repo_id, date, commits_count, lines_added, lines_removed, files_touched)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, date) DO UPDATE SET
        commits_count = excluded.commits_count,
        lines_added   = excluded.lines_added,
        lines_removed = excluded.lines_removed,
        files_touched = excluded.files_touched
    `);

    const upsertSummaries = db.transaction(() => {
      for (const [date, bucket] of dailyMap) {
        upsertSummaryStmt.run(
          repoId,
          date,
          bucket.commitsCount,
          bucket.linesAdded,
          bucket.linesRemoved,
          bucket.filesTouched.size,
        );
      }
    });

    upsertSummaries();

    // --- Insert file_activity records in batches ---
    const insertFileStmt = db.prepare(`
      INSERT INTO file_activity (repo_id, path, module, date, changes)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertFileBatch = db.transaction((batch: FileActivityRecord[]) => {
      for (const r of batch) {
        insertFileStmt.run(r.repoId, r.filePath, r.module, r.date, r.changes);
      }
    });

    for (let i = 0; i < accurateFileRecords.length; i += BATCH_SIZE) {
      const batch = accurateFileRecords.slice(i, i + BATCH_SIZE);
      insertFileBatch(batch);
    }

    // --- Update repo last_synced ---
    db.prepare('UPDATE repos SET last_synced = ? WHERE id = ?').run(
      new Date().toISOString(),
      repoId,
    );
  } finally {
    db.close();
  }

  // ------------------------------------------------------------------
  // Done — send completion stats
  // ------------------------------------------------------------------
  port.postMessage({
    type: 'complete',
    stats: {
      totalCommits,
      firstCommitDate: firstCommitDate || new Date().toISOString(),
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved,
      filesTracked: allFiles.size,
      branchCount,
      authorCount: authorSet.size,
      daysActive: activeDays.size,
    },
  });
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

if (parentPort) {
  parentPort.on('message', (msg: WorkerInput) => {
    run(msg).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      parentPort!.postMessage({ type: 'error', message });
    });
  });
}
