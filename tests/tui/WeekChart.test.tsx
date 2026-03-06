import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import WeekChart from '../../src/tui/components/WeekChart.js';

describe('WeekChart', () => {
  const sampleData = [
    { day: 'Mon', value: 100, isToday: false },
    { day: 'Tue', value: 200, isToday: false },
    { day: 'Wed', value: 150, isToday: true },
    { day: 'Thu', value: 0, isToday: false },
    { day: 'Fri', value: 50, isToday: false },
  ];

  it('renders all days', () => {
    const { lastFrame } = render(
      <WeekChart data={sampleData} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Mon');
    expect(frame).toContain('Tue');
    expect(frame).toContain('Wed');
    expect(frame).toContain('Thu');
    expect(frame).toContain('Fri');
  });

  it('marks today with an indicator', () => {
    const { lastFrame } = render(
      <WeekChart data={sampleData} />,
    );
    const frame = lastFrame()!;
    // Wed is today, should have the today indicator
    expect(frame).toContain('today');
  });

  it('shows values as "lines" for non-zero days', () => {
    const { lastFrame } = render(
      <WeekChart data={sampleData} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('100 lines');
    expect(frame).toContain('200 lines');
    expect(frame).toContain('150 lines');
    expect(frame).toContain('50 lines');
  });

  it('does not show line count for zero-value days', () => {
    const { lastFrame } = render(
      <WeekChart data={sampleData} />,
    );
    const frame = lastFrame()!;
    // Thu has value 0 - should not show "0 lines"
    const lines = frame.split('\n');
    const thuLine = lines.find((l) => l.includes('Thu'))!;
    expect(thuLine).not.toContain('lines');
  });

  it('uses filled blocks for non-zero values', () => {
    const data = [
      { day: 'Mon', value: 100, isToday: false },
    ];
    const { lastFrame } = render(
      <WeekChart data={data} />,
    );
    const frame = lastFrame()!;
    // Should have filled blocks U+2588
    expect(frame).toMatch(/\u2588/);
  });

  it('uses light blocks for zero-value days', () => {
    const data = [
      { day: 'Mon', value: 0, isToday: false },
    ];
    const { lastFrame } = render(
      <WeekChart data={data} />,
    );
    const frame = lastFrame()!;
    // Zero-value days get light shade blocks U+2591
    expect(frame).toMatch(/\u2591/);
  });

  it('the longest bar corresponds to the max value day', () => {
    const data = [
      { day: 'Mon', value: 50, isToday: false },
      { day: 'Tue', value: 100, isToday: false },
    ];
    const { lastFrame } = render(
      <WeekChart data={data} />,
    );
    const frame = lastFrame()!;
    const lines = frame.split('\n');
    const monLine = lines.find((l) => l.includes('Mon'))!;
    const tueLine = lines.find((l) => l.includes('Tue'))!;
    const monBarLen = (monLine.match(/\u2588/g) || []).length;
    const tueBarLen = (tueLine.match(/\u2588/g) || []).length;
    expect(tueBarLen).toBeGreaterThan(monBarLen);
  });
});
