import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import Header from '../../src/tui/components/Header.js';

describe('Header', () => {
  it('shows repo name', () => {
    const { lastFrame } = render(
      <Header repoName="my-project" streak={5} activeView={1} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('my-project');
  });

  it('shows WORKTALE brand', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={1} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('WORKTALE');
  });

  it('shows streak count', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={7} activeView={1} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Streak: 7 days');
  });

  it('shows singular "day" for streak of 1', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={1} activeView={1} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Streak: 1 day');
    expect(frame).not.toContain('Streak: 1 days');
  });

  it('shows plural "days" for streak of 0', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={1} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('Streak: 0 days');
  });

  it('highlights active tab - Overview', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={1} />,
    );
    const frame = lastFrame()!;
    // All four tabs should be visible
    expect(frame).toContain('[1] Overview');
    expect(frame).toContain('[2] Daily Log');
    expect(frame).toContain('[3] History');
    expect(frame).toContain('[4] AI Sessions');
  });

  it('highlights active tab - Daily Log', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={2} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('[2] Daily Log');
  });

  it('highlights active tab - History', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={3} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('[3] History');
  });

  it('highlights active tab - AI Sessions', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={4} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('[4] AI Sessions');
  });

  it('shows quit hint', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={1} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('q to quit');
  });

  it('renders the lightning bolt emoji', () => {
    const { lastFrame } = render(
      <Header repoName="test" streak={0} activeView={1} />,
    );
    const frame = lastFrame()!;
    // U+26A1 lightning bolt
    expect(frame).toContain('\u26A1');
  });
});
