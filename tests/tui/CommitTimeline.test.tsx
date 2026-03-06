import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CommitTimeline from '../../src/tui/components/CommitTimeline.js';

describe('CommitTimeline', () => {
  // Fix Date.now for consistent relative time display
  const realDateNow = Date.now;

  beforeEach(() => {
    // Pin "now" to a known time
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2025-06-15T18:00:00Z').getTime());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders commit messages', () => {
    const commits = [
      { sha: 'abc123', message: 'Add user login', timestamp: '2025-06-15T17:30:00Z' },
      { sha: 'def456', message: 'Fix navbar styling', timestamp: '2025-06-15T16:00:00Z' },
    ];

    const { lastFrame } = render(
      <CommitTimeline commits={commits} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Add user login');
    expect(frame).toContain('Fix navbar styling');
  });

  it('shows relative times', () => {
    const commits = [
      { sha: 'abc123', message: 'Recent commit', timestamp: '2025-06-15T17:55:00Z' },
      { sha: 'def456', message: 'Older commit', timestamp: '2025-06-15T15:00:00Z' },
    ];

    const { lastFrame } = render(
      <CommitTimeline commits={commits} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('5m ago');
    expect(frame).toContain('3h ago');
  });

  it('handles empty list with appropriate message', () => {
    const { lastFrame } = render(
      <CommitTimeline commits={[]} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('No commits to show');
  });

  it('truncates long commit messages', () => {
    const longMessage = 'A'.repeat(80);
    const commits = [
      { sha: 'abc123', message: longMessage, timestamp: '2025-06-15T17:00:00Z' },
    ];

    const { lastFrame } = render(
      <CommitTimeline commits={commits} />,
    );
    const frame = lastFrame()!;
    // Should be truncated to 57 chars + "..."
    expect(frame).toContain('...');
    expect(frame).not.toContain(longMessage);
  });

  it('renders bullet markers for each commit', () => {
    const commits = [
      { sha: 'abc123', message: 'First', timestamp: '2025-06-15T17:00:00Z' },
      { sha: 'def456', message: 'Second', timestamp: '2025-06-15T16:00:00Z' },
      { sha: 'ghi789', message: 'Third', timestamp: '2025-06-15T15:00:00Z' },
    ];

    const { lastFrame } = render(
      <CommitTimeline commits={commits} />,
    );
    const frame = lastFrame()!;
    // Each commit gets a filled circle marker U+25CF
    const bulletCount = (frame.match(/\u25CF/g) || []).length;
    expect(bulletCount).toBe(3);
  });

  it('shows "just now" for very recent commits', () => {
    const commits = [
      { sha: 'abc123', message: 'Just made this', timestamp: '2025-06-15T18:00:00Z' },
    ];

    const { lastFrame } = render(
      <CommitTimeline commits={commits} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('just now');
  });
});
