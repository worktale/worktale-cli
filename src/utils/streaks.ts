import { getDb } from '../db/index.js';
import { getDateString } from './formatting.js';

export function calculateCurrentStreak(dates: string[]): number {
  if (dates.length === 0) {
    return 0;
  }

  const today = getDateString();
  const yesterday = getDateString(
    new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1),
  );

  const dateSet = new Set(dates);

  // Streak must end on today or yesterday
  if (!dateSet.has(today) && !dateSet.has(yesterday)) {
    return 0;
  }

  const startDate = dateSet.has(today) ? today : yesterday;
  let streak = 0;
  let current = new Date(startDate + 'T00:00:00');

  while (dateSet.has(getDateString(current))) {
    streak++;
    current = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  }

  return streak;
}

export function calculateBestStreak(
  dates: string[],
): { length: number; startDate: string; endDate: string } {
  if (dates.length === 0) {
    return { length: 0, startDate: '', endDate: '' };
  }

  const sorted = [...dates].sort();
  let bestLength = 1;
  let bestStart = sorted[0];
  let bestEnd = sorted[0];

  let currentLength = 1;
  let currentStart = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diffDays = (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);

    if (diffDays === 1) {
      currentLength++;
    } else {
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
        bestEnd = sorted[i - 1];
      }
      currentLength = 1;
      currentStart = sorted[i];
    }
  }

  // Check the last streak
  if (currentLength > bestLength) {
    bestLength = currentLength;
    bestStart = currentStart;
    bestEnd = sorted[sorted.length - 1];
  }

  return { length: bestLength, startDate: bestStart, endDate: bestEnd };
}

export function getActiveDates(repoId: number): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT date(timestamp) AS d
       FROM commits
       WHERE repo_id = ?
       ORDER BY d ASC`,
    )
    .all(repoId) as { d: string }[];

  return rows.map((row) => row.d);
}

export function getStreakInfo(
  repoId: number,
): { current: number; best: number; bestStart: string; bestEnd: string } {
  const dates = getActiveDates(repoId);
  const current = calculateCurrentStreak(dates);
  const best = calculateBestStreak(dates);

  return {
    current,
    best: best.length,
    bestStart: best.startDate,
    bestEnd: best.endDate,
  };
}

export interface HourDistribution {
  hour: number;  // 0-23
  commits: number;
}

export function getWorkingHourDistribution(repoId: number): HourDistribution[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as cnt
    FROM commits
    WHERE repo_id = ?
    GROUP BY hour
    ORDER BY hour ASC
  `).all(repoId) as { hour: number; cnt: number }[];

  // Fill in all 24 hours
  const result: HourDistribution[] = [];
  const hourMap = new Map(rows.map(r => [r.hour, r.cnt]));
  for (let h = 0; h < 24; h++) {
    result.push({ hour: h, commits: hourMap.get(h) ?? 0 });
  }
  return result;
}

export function getEstimatedCodingTime(repoId: number, date: string): number {
  // Returns estimated coding time in minutes based on commit timestamps
  const db = getDb();
  const rows = db.prepare(`
    SELECT timestamp FROM commits
    WHERE repo_id = ? AND date(timestamp) = ?
    ORDER BY timestamp ASC
  `).all(repoId, date) as { timestamp: string }[];

  if (rows.length < 2) return 0;

  const first = new Date(rows[0].timestamp).getTime();
  const last = new Date(rows[rows.length - 1].timestamp).getTime();
  return Math.round((last - first) / (1000 * 60));
}

// Cross-repo variants (all-repos mode)

export function getAllActiveDates(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT date(timestamp) AS d
       FROM commits
       ORDER BY d ASC`,
    )
    .all() as { d: string }[];

  return rows.map((row) => row.d);
}

export function getAllReposStreakInfo(): { current: number; best: number; bestStart: string; bestEnd: string } {
  const dates = getAllActiveDates();
  const current = calculateCurrentStreak(dates);
  const best = calculateBestStreak(dates);

  return {
    current,
    best: best.length,
    bestStart: best.startDate,
    bestEnd: best.endDate,
  };
}

export function getAllReposMostActiveMonth(): { month: string; commits: number } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT strftime('%Y-%m', timestamp) AS ym, COUNT(*) AS cnt
       FROM commits
       GROUP BY ym
       ORDER BY cnt DESC
       LIMIT 1`,
    )
    .get() as { ym: string; cnt: number } | undefined;

  if (!row) {
    return { month: '', commits: 0 };
  }

  const [year, monthNum] = row.ym.split('-');
  const monthDate = new Date(parseInt(year, 10), parseInt(monthNum, 10) - 1, 1);
  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return { month: monthName, commits: row.cnt };
}

export function getMostActiveMonth(
  repoId: number,
): { month: string; commits: number } {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT strftime('%Y-%m', timestamp) AS ym, COUNT(*) AS cnt
       FROM commits
       WHERE repo_id = ?
       GROUP BY ym
       ORDER BY cnt DESC
       LIMIT 1`,
    )
    .get(repoId) as { ym: string; cnt: number } | undefined;

  if (!row) {
    return { month: '', commits: 0 };
  }

  const [year, monthNum] = row.ym.split('-');
  const monthDate = new Date(parseInt(year, 10), parseInt(monthNum, 10) - 1, 1);
  const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return { month: monthName, commits: row.cnt };
}
