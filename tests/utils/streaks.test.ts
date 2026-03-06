import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calculateCurrentStreak,
  calculateBestStreak,
} from '../../src/utils/streaks.js';

// We need to control "today" to write deterministic tests.
// calculateCurrentStreak relies on getDateString() which uses new Date().

// ---------- calculateCurrentStreak ----------

describe('calculateCurrentStreak', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 for empty dates array', () => {
    expect(calculateCurrentStreak([])).toBe(0);
  });

  it('returns 1 when only today has a commit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6, 2026

    expect(calculateCurrentStreak(['2026-03-06'])).toBe(1);
  });

  it('returns 1 when only yesterday has a commit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6

    expect(calculateCurrentStreak(['2026-03-05'])).toBe(1);
  });

  it('returns 0 when the latest commit was 2+ days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6

    expect(calculateCurrentStreak(['2026-03-04'])).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6

    const dates = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'];
    expect(calculateCurrentStreak(dates)).toBe(5);
  });

  it('counts consecutive days ending yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6

    const dates = ['2026-03-03', '2026-03-04', '2026-03-05'];
    expect(calculateCurrentStreak(dates)).toBe(3);
  });

  it('stops at a gap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6

    // Gap between March 3 and March 5
    const dates = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-05', '2026-03-06'];
    expect(calculateCurrentStreak(dates)).toBe(2); // Only March 5 + 6
  });

  it('handles unsorted input', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6

    // Dates not in order — calculateCurrentStreak uses a Set so order shouldn't matter
    const dates = ['2026-03-06', '2026-03-04', '2026-03-05'];
    expect(calculateCurrentStreak(dates)).toBe(3);
  });

  it('handles duplicate dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0)); // March 6

    const dates = ['2026-03-05', '2026-03-05', '2026-03-06', '2026-03-06'];
    expect(calculateCurrentStreak(dates)).toBe(2);
  });
});

// ---------- calculateBestStreak ----------

describe('calculateBestStreak', () => {
  it('returns 0 length for empty dates', () => {
    const result = calculateBestStreak([]);
    expect(result.length).toBe(0);
    expect(result.startDate).toBe('');
    expect(result.endDate).toBe('');
  });

  it('returns 1 for a single date', () => {
    const result = calculateBestStreak(['2026-03-06']);
    expect(result.length).toBe(1);
    expect(result.startDate).toBe('2026-03-06');
    expect(result.endDate).toBe('2026-03-06');
  });

  it('finds the longest consecutive run', () => {
    const dates = [
      '2026-03-01', '2026-03-02', '2026-03-03',  // 3-day streak
      // gap
      '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14', // 5-day streak
      // gap
      '2026-03-20', '2026-03-21',  // 2-day streak
    ];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(5);
    expect(result.startDate).toBe('2026-03-10');
    expect(result.endDate).toBe('2026-03-14');
  });

  it('handles all consecutive dates', () => {
    const dates = ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(5);
    expect(result.startDate).toBe('2026-03-01');
    expect(result.endDate).toBe('2026-03-05');
  });

  it('handles all non-consecutive dates', () => {
    const dates = ['2026-03-01', '2026-03-03', '2026-03-05', '2026-03-07'];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(1);
  });

  it('picks the first streak when there is a tie', () => {
    // Two 3-day streaks
    const dates = [
      '2026-03-01', '2026-03-02', '2026-03-03',
      // gap
      '2026-03-10', '2026-03-11', '2026-03-12',
    ];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(3);
    // With the > comparison in the source, the first streak wins
    expect(result.startDate).toBe('2026-03-01');
    expect(result.endDate).toBe('2026-03-03');
  });

  it('handles unsorted input', () => {
    // The function sorts internally
    const dates = ['2026-03-05', '2026-03-03', '2026-03-04', '2026-03-01', '2026-03-02'];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(5);
    expect(result.startDate).toBe('2026-03-01');
    expect(result.endDate).toBe('2026-03-05');
  });

  it('streak at the very end of the input', () => {
    const dates = [
      '2026-03-01',
      // gap
      '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13',
    ];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(4);
    expect(result.startDate).toBe('2026-03-10');
    expect(result.endDate).toBe('2026-03-13');
  });

  it('handles month boundary correctly', () => {
    const dates = ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(4);
    expect(result.startDate).toBe('2026-02-27');
    expect(result.endDate).toBe('2026-03-02');
  });

  it('handles year boundary correctly', () => {
    const dates = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'];
    const result = calculateBestStreak(dates);
    expect(result.length).toBe(4);
    expect(result.startDate).toBe('2025-12-30');
    expect(result.endDate).toBe('2026-01-02');
  });
});
