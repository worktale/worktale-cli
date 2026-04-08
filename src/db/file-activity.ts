import { getDb } from './index.js';

export interface FileActivity {
  id: number;
  repo_id: number;
  path: string | null;
  module: string | null;
  date: string | null;
  changes: number;
}

export interface FileActivityInsert {
  repo_id: number;
  path?: string | null;
  module?: string | null;
  date: string;
  changes?: number;
}

export interface ModuleActivity {
  module: string;
  changes: number;
  percentage: number;
}

export function insertFileActivity(data: FileActivityInsert): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO file_activity (repo_id, path, module, date, changes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.repo_id,
    data.path ?? null,
    data.module ?? null,
    data.date,
    data.changes ?? 0,
  );
}

export function insertFileActivityBatch(records: FileActivityInsert[]): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO file_activity (repo_id, path, module, date, changes)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertBatch = db.transaction((batch: FileActivityInsert[]) => {
    for (const r of batch) {
      stmt.run(
        r.repo_id,
        r.path ?? null,
        r.module ?? null,
        r.date,
        r.changes ?? 0,
      );
    }
  });

  insertBatch(records);
}

export function getModuleActivity(repoId: number): ModuleActivity[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT module, SUM(changes) as changes
    FROM file_activity
    WHERE repo_id = ? AND module IS NOT NULL
    GROUP BY module
    ORDER BY changes DESC
  `).all(repoId) as { module: string; changes: number }[];

  const totalChanges = rows.reduce((sum, r) => sum + r.changes, 0);

  return rows.map((r) => ({
    module: r.module,
    changes: r.changes,
    percentage: totalChanges > 0 ? Math.round((r.changes / totalChanges) * 10000) / 100 : 0,
  }));
}

export function getModuleActivityByDate(repoId: number, date: string): ModuleActivity[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT module, SUM(changes) as changes
    FROM file_activity
    WHERE repo_id = ? AND date = ? AND module IS NOT NULL
    GROUP BY module
    ORDER BY changes DESC
  `).all(repoId, date) as { module: string; changes: number }[];

  const totalChanges = rows.reduce((sum, r) => sum + r.changes, 0);

  return rows.map((r) => ({
    module: r.module,
    changes: r.changes,
    percentage: totalChanges > 0 ? Math.round((r.changes / totalChanges) * 10000) / 100 : 0,
  }));
}

export function getTopModules(repoId: number, limit: number): ModuleActivity[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT module, SUM(changes) as changes
    FROM file_activity
    WHERE repo_id = ? AND module IS NOT NULL
    GROUP BY module
    ORDER BY changes DESC
    LIMIT ?
  `).all(repoId, limit) as { module: string; changes: number }[];

  const totalChanges = rows.reduce((sum, r) => sum + r.changes, 0);

  return rows.map((r) => ({
    module: r.module,
    changes: r.changes,
    percentage: totalChanges > 0 ? Math.round((r.changes / totalChanges) * 10000) / 100 : 0,
  }));
}

// Cross-repo variants (all-repos mode)

export function getAllModuleActivityByDate(date: string): ModuleActivity[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT module, SUM(changes) as changes
    FROM file_activity
    WHERE date = ? AND module IS NOT NULL
    GROUP BY module
    ORDER BY changes DESC
  `).all(date) as { module: string; changes: number }[];

  const totalChanges = rows.reduce((sum, r) => sum + r.changes, 0);

  return rows.map((r) => ({
    module: r.module,
    changes: r.changes,
    percentage: totalChanges > 0 ? Math.round((r.changes / totalChanges) * 10000) / 100 : 0,
  }));
}

export function getAllTopModules(limit: number): ModuleActivity[] {
  const db = getDb();

  const rows = db.prepare(`
    SELECT module, SUM(changes) as changes
    FROM file_activity
    WHERE module IS NOT NULL
    GROUP BY module
    ORDER BY changes DESC
    LIMIT ?
  `).all(limit) as { module: string; changes: number }[];

  const totalChanges = rows.reduce((sum, r) => sum + r.changes, 0);

  return rows.map((r) => ({
    module: r.module,
    changes: r.changes,
    percentage: totalChanges > 0 ? Math.round((r.changes / totalChanges) * 10000) / 100 : 0,
  }));
}
