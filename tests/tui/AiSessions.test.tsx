import React from 'react';
import { render } from 'ink-testing-library';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the AI sessions data layer so the component renders without a DB.
const mockGetAiSessionStats = vi.fn();
const mockGetDailyAiSummary = vi.fn();

vi.mock('../../src/db/ai-sessions.js', () => ({
  getAiSessionStats: (...args: unknown[]) => mockGetAiSessionStats(...args),
  getDailyAiSummary: (...args: unknown[]) => mockGetDailyAiSummary(...args),
}));

import AiSessions from '../../src/tui/components/AiSessions.js';

// Lets React useEffect callbacks run and re-render before we sample the frame.
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('AiSessions', () => {
  beforeEach(() => {
    mockGetAiSessionStats.mockReset();
    mockGetDailyAiSummary.mockReset();
  });

  it('shows the empty state when no sessions exist', async () => {
    mockGetAiSessionStats.mockReturnValue({
      total_sessions: 0,
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_duration_secs: 0,
      providers: {},
      models: {},
      tools: {},
      tools_used_frequency: {},
      mcp_servers_used: {},
    });
    mockGetDailyAiSummary.mockReturnValue([]);

    const { lastFrame } = render(<AiSessions repoId={1} />);
    await flush();
    const frame = lastFrame()!;
    expect(frame).toContain('AI Sessions');
    expect(frame).toContain('No AI sessions recorded yet.');
    expect(frame).toContain('worktale session add');
  });

  it('shows the empty state when the data layer throws', async () => {
    mockGetAiSessionStats.mockImplementation(() => {
      throw new Error('table missing');
    });
    mockGetDailyAiSummary.mockReturnValue([]);

    const { lastFrame } = render(<AiSessions repoId={1} />);
    await flush();
    const frame = lastFrame()!;
    expect(frame).toContain('AI Sessions');
    expect(frame).toContain('No AI sessions recorded yet.');
  });

  it('renders KPI totals when sessions exist', async () => {
    mockGetAiSessionStats.mockReturnValue({
      total_sessions: 12,
      total_cost: 4.5678,
      total_input_tokens: 1234,
      total_output_tokens: 5678,
      total_duration_secs: 3 * 3600 + 25 * 60,
      providers: { anthropic: 8, openai: 4 },
      models: { 'claude-opus-4-7': 7, 'gpt-5': 5 },
      tools: { 'claude-code': 7, codex: 3, opencode: 2 },
      tools_used_frequency: { Read: 40, Edit: 22, Bash: 18 },
      mcp_servers_used: { 'claude-mem': 3 },
    });
    mockGetDailyAiSummary.mockReturnValue([
      { date: '2026-04-10', sessions: 3, cost: 1.23, tokens: 4200 },
      { date: '2026-04-11', sessions: 2, cost: 0.55, tokens: 1900 },
    ]);

    const { lastFrame } = render(<AiSessions repoId={1} />);
    await flush();
    const frame = lastFrame()!;

    // Title row + window
    expect(frame).toContain('AI Sessions');
    expect(frame).toContain('last 30 days');

    // KPIs
    expect(frame).toContain('12');
    expect(frame).toContain('sessions');
    expect(frame).toContain('$4.57');
    expect(frame).toContain('cost');
    // 1234 + 5678 = 6912 → "6.9k"
    expect(frame).toContain('6.9k');
    expect(frame).toContain('tokens');
    expect(frame).toContain('3h 25m');
    expect(frame).toContain('active');
  });

  it('renders breakdowns and labels for agents, models, providers, tools, and MCP servers', async () => {
    mockGetAiSessionStats.mockReturnValue({
      total_sessions: 5,
      total_cost: 0.42,
      total_input_tokens: 100,
      total_output_tokens: 200,
      total_duration_secs: 600,
      providers: { anthropic: 3 },
      models: { 'claude-opus-4-7': 3 },
      tools: { 'claude-code': 3 },
      tools_used_frequency: { Read: 5, Edit: 3 },
      mcp_servers_used: { 'claude-mem': 2 },
    });
    mockGetDailyAiSummary.mockReturnValue([]);

    const { lastFrame } = render(<AiSessions repoId={1} />);
    await flush();
    const frame = lastFrame()!;

    expect(frame).toContain('Agents');
    expect(frame).toContain('Models');
    expect(frame).toContain('Providers');
    expect(frame).toContain('Top agent tools');
    expect(frame).toContain('MCP servers');

    // Specific entries should be visible.
    expect(frame).toContain('claude-code');
    expect(frame).toContain('claude-opus-4-7');
    expect(frame).toContain('anthropic');
    expect(frame).toContain('Read');
    expect(frame).toContain('claude-mem');
  });

  it('hides the MCP block when no servers were used', async () => {
    mockGetAiSessionStats.mockReturnValue({
      total_sessions: 1,
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_duration_secs: 0,
      providers: {},
      models: {},
      tools: { codex: 1 },
      tools_used_frequency: {},
      mcp_servers_used: {},
    });
    mockGetDailyAiSummary.mockReturnValue([]);

    const { lastFrame } = render(<AiSessions repoId={1} />);
    await flush();
    const frame = lastFrame()!;
    // The "Agents" header should be present (so we know we're past the empty state),
    // but the MCP servers section should be hidden.
    expect(frame).toContain('Agents');
    expect(frame).not.toContain('MCP servers');
  });

  it('renders sparkline labels for cost and tokens per day', async () => {
    mockGetAiSessionStats.mockReturnValue({
      total_sessions: 2,
      total_cost: 1.0,
      total_input_tokens: 500,
      total_output_tokens: 500,
      total_duration_secs: 120,
      providers: {},
      models: {},
      tools: {},
      tools_used_frequency: {},
      mcp_servers_used: {},
    });
    mockGetDailyAiSummary.mockReturnValue([
      { date: '2026-04-10', sessions: 1, cost: 0.5, tokens: 500 },
      { date: '2026-04-11', sessions: 1, cost: 0.5, tokens: 500 },
    ]);

    const { lastFrame } = render(<AiSessions repoId={1} />);
    await flush();
    const frame = lastFrame()!;
    expect(frame).toContain('Cost/day');
    expect(frame).toContain('Tokens/day');
    expect(frame).toContain('peak');
  });

  it('shows the keybinding footer', async () => {
    mockGetAiSessionStats.mockReturnValue({
      total_sessions: 0,
      total_cost: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_duration_secs: 0,
      providers: {},
      models: {},
      tools: {},
      tools_used_frequency: {},
      mcp_servers_used: {},
    });
    mockGetDailyAiSummary.mockReturnValue([]);

    const { lastFrame } = render(<AiSessions repoId={1} />);
    await flush();
    const frame = lastFrame()!;
    expect(frame).toContain('[Tab] Switch view');
    expect(frame).toContain('[q] Quit');
  });
});
