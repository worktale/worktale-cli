import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import HeatmapGrid from '../../src/tui/components/HeatmapGrid.js';

describe('HeatmapGrid', () => {
  it('renders with empty data', () => {
    const data = new Map<string, number>();
    const { lastFrame } = render(
      <HeatmapGrid data={data} />,
    );
    const frame = lastFrame()!;
    // Should render the grid structure with day labels
    expect(frame).toContain('Mon');
    expect(frame).toContain('Wed');
    expect(frame).toContain('Fri');
    expect(frame).toContain('Sun');
    // Should render the legend
    expect(frame).toContain('Less');
    expect(frame).toContain('More');
  });

  it('shows heat level 0 (light shade) for dates with no commits', () => {
    const data = new Map<string, number>();
    const { lastFrame } = render(
      <HeatmapGrid data={data} />,
    );
    const frame = lastFrame()!;
    // Light shade block U+2591 should be present for empty cells
    expect(frame).toMatch(/\u2591/);
  });

  it('shows correct heat levels for different commit counts', () => {
    // Create a data map with various commit counts
    const data = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Format a date as YYYY-MM-DD
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    // 1-2 commits = level 1 (medium shade U+2592)
    const d1 = new Date(today);
    d1.setDate(d1.getDate() - 1);
    data.set(fmt(d1), 1);

    // 3-5 commits = level 2 (dark shade U+2593)
    const d2 = new Date(today);
    d2.setDate(d2.getDate() - 2);
    data.set(fmt(d2), 4);

    // 6+ commits = level 3 (full block U+2588)
    const d3 = new Date(today);
    d3.setDate(d3.getDate() - 3);
    data.set(fmt(d3), 10);

    const { lastFrame } = render(
      <HeatmapGrid data={data} />,
    );
    const frame = lastFrame()!;

    // The frame should contain characters from different heat levels
    // Level 0: U+2591, Level 1: U+2592, Level 2: U+2593, Level 3: U+2588
    expect(frame).toMatch(/\u2591/); // empty days
    expect(frame).toMatch(/\u2592/); // low activity
    expect(frame).toMatch(/\u2593/); // medium activity
    expect(frame).toMatch(/\u2588/); // high activity
  });

  it('includes month labels', () => {
    const data = new Map<string, number>();
    const { lastFrame } = render(
      <HeatmapGrid data={data} />,
    );
    const frame = lastFrame()!;
    // Should contain at least one month abbreviation
    const monthAbbrs = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hasMonth = monthAbbrs.some((m) => frame.includes(m));
    expect(hasMonth).toBe(true);
  });

  it('renders 7 rows for days of the week', () => {
    const data = new Map<string, number>();
    const { lastFrame } = render(
      <HeatmapGrid data={data} />,
    );
    const frame = lastFrame()!;
    const lines = frame.split('\n');
    // Should have: month label row + 7 day rows + blank line + legend = at least 9 lines
    // Day labels appear on rows 0 (Mon), 2 (Wed), 4 (Fri), 6 (Sun)
    expect(lines.length).toBeGreaterThanOrEqual(9);
  });

  it('renders the Less/More legend', () => {
    const data = new Map<string, number>();
    const { lastFrame } = render(
      <HeatmapGrid data={data} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Less');
    expect(frame).toContain('More');
  });
});
