import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import StatBar from '../../src/tui/components/StatBar.js';

describe('StatBar', () => {
  it('renders label and percentage', () => {
    const { lastFrame } = render(
      <StatBar label="JavaScript" value={50} maxValue={100} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('JavaScript');
    expect(frame).toContain('50%');
  });

  it('shows 100% when value equals maxValue', () => {
    const { lastFrame } = render(
      <StatBar label="TypeScript" value={100} maxValue={100} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('100%');
  });

  it('shows 0% when value is zero', () => {
    const { lastFrame } = render(
      <StatBar label="Rust" value={0} maxValue={100} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('0%');
  });

  it('handles zero maxValue without crashing', () => {
    const { lastFrame } = render(
      <StatBar label="Empty" value={0} maxValue={0} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Empty');
    expect(frame).toContain('0%');
  });

  it('bar length is proportional to value', () => {
    const width = 30;
    // At 50%, we expect ~15 filled chars
    const { lastFrame } = render(
      <StatBar label="Half" value={50} maxValue={100} width={width} />,
    );
    const frame = lastFrame()!;
    // Count filled block characters (U+2588)
    const filledCount = (frame.match(/\u2588/g) || []).length;
    // Should be approximately half of width
    expect(filledCount).toBe(15);
  });

  it('full bar has all filled characters', () => {
    const width = 20;
    const { lastFrame } = render(
      <StatBar label="Full" value={100} maxValue={100} width={width} />,
    );
    const frame = lastFrame()!;
    const filledCount = (frame.match(/\u2588/g) || []).length;
    expect(filledCount).toBe(width);
  });

  it('empty bar has all empty characters', () => {
    const width = 20;
    const { lastFrame } = render(
      <StatBar label="Zero" value={0} maxValue={100} width={width} />,
    );
    const frame = lastFrame()!;
    const emptyCount = (frame.match(/\u2591/g) || []).length;
    expect(emptyCount).toBe(width);
  });

  it('caps bar width at full when value exceeds maxValue', () => {
    const width = 10;
    const { lastFrame } = render(
      <StatBar label="Overflow" value={200} maxValue={100} width={width} />,
    );
    const frame = lastFrame()!;
    // The percentage formula uses raw value/maxValue (can exceed 100%)
    // but the bar is capped at the full width via Math.min(value/maxValue, 1)
    const filledCount = (frame.match(/\u2588/g) || []).length;
    expect(filledCount).toBe(width);
    // No empty blocks since bar is fully filled
    const emptyCount = (frame.match(/\u2591/g) || []).length;
    expect(emptyCount).toBe(0);
  });
});
