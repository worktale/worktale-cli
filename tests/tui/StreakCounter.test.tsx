import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import StreakCounter from '../../src/tui/components/StreakCounter.js';

describe('StreakCounter', () => {
  it('shows current and best streak values', () => {
    const { lastFrame } = render(
      <StreakCounter current={5} best={10} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('5 days');
    expect(frame).toContain('10 days');
  });

  it('shows singular "day" for streak of 1', () => {
    const { lastFrame } = render(
      <StreakCounter current={1} best={1} />,
    );
    const frame = lastFrame()!;
    // "1 day" without an "s"
    expect(frame).toContain('1 day');
    expect(frame).not.toMatch(/1 days/);
  });

  it('shows plural "days" for streaks > 1', () => {
    const { lastFrame } = render(
      <StreakCounter current={3} best={7} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('3 days');
    expect(frame).toContain('7 days');
  });

  it('shows STREAK label', () => {
    const { lastFrame } = render(
      <StreakCounter current={2} best={5} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('STREAK');
  });

  it('shows BEST label', () => {
    const { lastFrame } = render(
      <StreakCounter current={2} best={5} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('BEST');
  });

  it('handles zero streaks', () => {
    const { lastFrame } = render(
      <StreakCounter current={0} best={0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('0 days');
    // Should still render without errors
    expect(frame).toContain('STREAK');
    expect(frame).toContain('BEST');
  });

  it('bar proportions are correct when current equals best', () => {
    const { lastFrame } = render(
      <StreakCounter current={10} best={10} />,
    );
    const frame = lastFrame()!;
    // Both bars should be full (same length, using heavy horizontal line U+2501)
    const lines = frame.split('\n');
    const streakLine = lines.find((l) => l.includes('STREAK'))!;
    const bestLine = lines.find((l) => l.includes('BEST'))!;
    const streakBarLen = (streakLine.match(/\u2501/g) || []).length;
    const bestBarLen = (bestLine.match(/\u2501/g) || []).length;
    expect(streakBarLen).toBe(bestBarLen);
  });

  it('current bar is shorter when current < best', () => {
    const { lastFrame } = render(
      <StreakCounter current={5} best={10} />,
    );
    const frame = lastFrame()!;
    const lines = frame.split('\n');
    const streakLine = lines.find((l) => l.includes('STREAK'))!;
    const bestLine = lines.find((l) => l.includes('BEST'))!;
    const streakBarLen = (streakLine.match(/\u2501/g) || []).length;
    const bestBarLen = (bestLine.match(/\u2501/g) || []).length;
    expect(streakBarLen).toBeLessThan(bestBarLen);
  });
});
