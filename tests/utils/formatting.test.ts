import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatNumber,
  formatDate,
  formatDateShort,
  formatRelativeTime,
  formatDuration,
  formatLines,
  daysAgo,
  getDateString,
  getWeekDates,
  getMonthDates,
} from '../../src/utils/formatting.js';

// ---------- formatNumber ----------

describe('formatNumber', () => {
  it('formats 0', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats numbers under 1000 without commas', () => {
    expect(formatNumber(999)).toBe('999');
  });

  it('formats 1,000 with comma', () => {
    expect(formatNumber(1000)).toBe('1,000');
  });

  it('formats 1,000,000 with commas', () => {
    expect(formatNumber(1000000)).toBe('1,000,000');
  });

  it('formats negative numbers', () => {
    expect(formatNumber(-1500)).toBe('-1,500');
  });
});

// ---------- formatDate ----------

describe('formatDate', () => {
  it('formats a Date object to full date string', () => {
    // Use a fixed date to avoid locale issues
    const date = new Date(2026, 2, 6); // March 6, 2026
    const result = formatDate(date);
    expect(result).toContain('March');
    expect(result).toContain('2026');
    expect(result).toContain('6');
    expect(result).toContain('Friday');
  });

  it('formats a string date', () => {
    const result = formatDate('2026-01-15T00:00:00');
    expect(result).toContain('January');
    expect(result).toContain('15');
    expect(result).toContain('2026');
  });

  it('includes the day of week', () => {
    // January 1, 2026 is a Thursday
    const result = formatDate(new Date(2026, 0, 1));
    expect(result).toContain('Thursday');
  });
});

// ---------- formatDateShort ----------

describe('formatDateShort', () => {
  it('formats a Date object to abbreviated date', () => {
    const date = new Date(2026, 2, 6); // March 6, 2026
    const result = formatDateShort(date);
    expect(result).toContain('Mar');
    expect(result).toContain('2026');
    expect(result).toContain('6');
  });

  it('formats a string date', () => {
    const result = formatDateShort('2026-12-25T00:00:00');
    expect(result).toContain('Dec');
    expect(result).toContain('25');
    expect(result).toContain('2026');
  });

  it('does not include the day of week', () => {
    const result = formatDateShort(new Date(2026, 0, 1));
    expect(result).not.toContain('Thursday');
    expect(result).not.toContain('Wed');
  });
});

// ---------- formatRelativeTime ----------

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than a minute ago', () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe('just now');
  });

  it('returns minutes ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:05:00Z'));
    const fiveMinAgo = new Date('2026-03-06T12:00:00Z');
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
    vi.useRealTimers();
  });

  it('returns hours ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T15:00:00Z'));
    const threeHoursAgo = new Date('2026-03-06T12:00:00Z');
    expect(formatRelativeTime(threeHoursAgo)).toBe('3h ago');
    vi.useRealTimers();
  });

  it('returns days ago', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00Z'));
    const twoDaysAgo = new Date('2026-03-04T12:00:00Z');
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
    vi.useRealTimers();
  });

  it('accepts string dates', () => {
    const recent = new Date(Date.now() - 30_000).toISOString(); // 30 seconds ago
    expect(formatRelativeTime(recent)).toBe('just now');
  });
});

// ---------- formatDuration ----------

describe('formatDuration', () => {
  it('formats minutes under 60', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('formats exactly 60 minutes as hours', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('formats hours with remaining minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('formats exact multiple of 60', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('formats 0 minutes', () => {
    expect(formatDuration(0)).toBe('0m');
  });

  it('formats large durations', () => {
    expect(formatDuration(600)).toBe('10h');
    expect(formatDuration(601)).toBe('10h 1m');
  });
});

// ---------- formatLines ----------

describe('formatLines', () => {
  it('formats added and removed lines', () => {
    expect(formatLines(100, 50)).toBe('+100 / -50');
  });

  it('formats zero values', () => {
    expect(formatLines(0, 0)).toBe('+0 / -0');
  });

  it('formats large numbers with commas', () => {
    expect(formatLines(10000, 5000)).toBe('+10,000 / -5,000');
  });
});

// ---------- daysAgo ----------

describe('daysAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T15:00:00'));
    expect(daysAgo(new Date('2026-03-06T08:00:00'))).toBe(0);
    vi.useRealTimers();
  });

  it('returns 1 for yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T15:00:00'));
    expect(daysAgo(new Date('2026-03-05T23:59:00'))).toBe(1);
    vi.useRealTimers();
  });

  it('returns correct count for multiple days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
    expect(daysAgo(new Date('2026-03-01T12:00:00'))).toBe(5);
    vi.useRealTimers();
  });

  it('accepts string dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
    expect(daysAgo('2026-03-04T00:00:00')).toBe(2);
    vi.useRealTimers();
  });
});

// ---------- getDateString ----------

describe('getDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = getDateString(new Date(2026, 2, 6)); // March 6, 2026
    expect(result).toBe('2026-03-06');
  });

  it('pads single-digit month and day', () => {
    const result = getDateString(new Date(2026, 0, 5)); // January 5, 2026
    expect(result).toBe('2026-01-05');
  });

  it('defaults to current date when no argument given', () => {
    const result = getDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles end of year', () => {
    const result = getDateString(new Date(2026, 11, 31)); // December 31, 2026
    expect(result).toBe('2026-12-31');
  });
});

// ---------- getWeekDates ----------

describe('getWeekDates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns exactly 5 dates (Mon–Fri)', () => {
    const dates = getWeekDates();
    expect(dates.length).toBe(5);
  });

  it('all dates are in YYYY-MM-DD format', () => {
    const dates = getWeekDates();
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('starts on Monday', () => {
    vi.useFakeTimers();
    // March 6, 2026 is a Friday
    vi.setSystemTime(new Date(2026, 2, 6, 12, 0, 0));
    const dates = getWeekDates();
    expect(dates[0]).toBe('2026-03-02'); // Monday
    expect(dates[4]).toBe('2026-03-06'); // Friday
    vi.useRealTimers();
  });

  it('works on a Monday', () => {
    vi.useFakeTimers();
    // March 2, 2026 is a Monday
    vi.setSystemTime(new Date(2026, 2, 2, 12, 0, 0));
    const dates = getWeekDates();
    expect(dates[0]).toBe('2026-03-02');
    vi.useRealTimers();
  });

  it('works on a Sunday', () => {
    vi.useFakeTimers();
    // March 8, 2026 is a Sunday
    vi.setSystemTime(new Date(2026, 2, 8, 12, 0, 0));
    const dates = getWeekDates();
    expect(dates[0]).toBe('2026-03-02'); // Previous Monday
    vi.useRealTimers();
  });
});

// ---------- getMonthDates ----------

describe('getMonthDates', () => {
  it('returns all dates in January (31 days)', () => {
    const dates = getMonthDates(2026, 1);
    expect(dates.length).toBe(31);
    expect(dates[0]).toBe('2026-01-01');
    expect(dates[30]).toBe('2026-01-31');
  });

  it('returns all dates in February non-leap year (28 days)', () => {
    const dates = getMonthDates(2026, 2);
    expect(dates.length).toBe(28);
    expect(dates[0]).toBe('2026-02-01');
    expect(dates[27]).toBe('2026-02-28');
  });

  it('returns all dates in February leap year (29 days)', () => {
    const dates = getMonthDates(2024, 2);
    expect(dates.length).toBe(29);
    expect(dates[28]).toBe('2024-02-29');
  });

  it('returns all dates in April (30 days)', () => {
    const dates = getMonthDates(2026, 4);
    expect(dates.length).toBe(30);
  });

  it('all dates are in YYYY-MM-DD format', () => {
    const dates = getMonthDates(2026, 6);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns dates in ascending order', () => {
    const dates = getMonthDates(2026, 3);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true);
    }
  });
});
