import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { getAiSessionStats, getDailyAiSummary } from '../../db/ai-sessions.js';
import type { AiSessionStats } from '../../db/ai-sessions.js';
import { formatNumber, getDateString } from '../../utils/formatting.js';

interface AiSessionsProps {
  repoId: number;
}

interface DailyPoint {
  date: string;
  sessions: number;
  cost: number;
  tokens: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function formatUsd(n: number): string {
  if (n <= 0) return '$0.00';
  return '$' + n.toFixed(2);
}

function formatDuration(totalSecs: number): string {
  if (totalSecs <= 0) return '--';
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.round((totalSecs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Renders a tiny inline sparkline bar for a series of daily cost values.
 */
function Sparkline({ values, max }: { values: number[]; max: number }): React.ReactElement {
  const glyphs = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];
  const line = values
    .map((v) => {
      if (max <= 0) return glyphs[0];
      const ratio = Math.min(1, v / max);
      const idx = Math.min(glyphs.length - 1, Math.max(0, Math.round(ratio * (glyphs.length - 1))));
      return glyphs[idx];
    })
    .join('');
  return <Text color={colors.brand}>{line}</Text>;
}

function topEntries(map: Record<string, number>, limit = 5): Array<[string, number]> {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export default function AiSessions({ repoId }: AiSessionsProps): React.ReactElement {
  const [stats, setStats] = useState<AiSessionStats | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [days] = useState<number>(30);

  useEffect(() => {
    try {
      const s = getAiSessionStats(repoId, days);
      setStats(s);

      const end = getDateString();
      const since = new Date();
      since.setDate(since.getDate() - (days - 1));
      const start = getDateString(since);
      const daily = getDailyAiSummary(repoId, start, end);

      // Fill gaps with zeros so the sparkline renders a smooth series
      const dayMap = new Map(daily.map((d) => [d.date, d]));
      const filled: DailyPoint[] = [];
      const cursor = new Date(since);
      while (cursor <= new Date(end)) {
        const iso = getDateString(cursor);
        filled.push(
          dayMap.get(iso) ?? { date: iso, sessions: 0, cost: 0, tokens: 0 },
        );
        cursor.setDate(cursor.getDate() + 1);
      }
      setDaily(filled);
    } catch {
      // no ai sessions yet — leave defaults
    }
  }, [repoId, days]);

  if (!stats || stats.total_sessions === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color={colors.textPrimary} bold>AI Sessions</Text>
          <Text color={colors.dim}>  {'\u2022'}  last {days} days</Text>
        </Box>
        <Box borderStyle="round" borderColor={colors.dim} paddingX={1}>
          <Text color={colors.textSecondary}>
            No AI sessions recorded yet.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={colors.dim}>
            Install a Worktale plugin (Claude Code, Codex, OpenCode, Copilot) to capture sessions automatically, or run:
          </Text>
        </Box>
        <Box marginTop={0}>
          <Text color={colors.brand}>  worktale session add --provider anthropic --tool claude-code ...</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={colors.dim}>
            [Tab] Switch view    [q] Quit
          </Text>
        </Box>
      </Box>
    );
  }

  const maxCost = daily.reduce((m, d) => Math.max(m, d.cost), 0);
  const maxTokens = daily.reduce((m, d) => Math.max(m, d.tokens), 0);
  const topTools = topEntries(stats.tools, 4);
  const topModels = topEntries(stats.models, 4);
  const topProviders = topEntries(stats.providers, 4);
  const topAgentTools = topEntries(stats.tools_used_frequency, 6);
  const topMcps = topEntries(stats.mcp_servers_used, 4);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text color={colors.textPrimary} bold>AI Sessions</Text>
        <Text color={colors.dim}>  {'\u2022'}  last {days} days</Text>
      </Box>

      {/* KPIs */}
      <Box borderStyle="round" borderColor={colors.dim} flexDirection="column" paddingX={1}>
        <Text color={colors.textSecondary} bold> Totals </Text>
        <Box>
          <Box width={22}>
            <Text color={colors.brand} bold>{formatNumber(stats.total_sessions)}</Text>
            <Text color={colors.textSecondary}> sessions</Text>
          </Box>
          <Box width={22}>
            <Text color={colors.streak} bold>{formatUsd(stats.total_cost)}</Text>
            <Text color={colors.textSecondary}> cost</Text>
          </Box>
          <Box width={22}>
            <Text color={colors.brand}>{formatTokens(stats.total_input_tokens + stats.total_output_tokens)}</Text>
            <Text color={colors.textSecondary}> tokens</Text>
          </Box>
          <Box>
            <Text color={colors.brand}>{formatDuration(stats.total_duration_secs)}</Text>
            <Text color={colors.textSecondary}> active</Text>
          </Box>
        </Box>
      </Box>

      {/* Sparklines */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box width={12}>
            <Text color={colors.textSecondary}>Cost/day</Text>
          </Box>
          <Sparkline values={daily.map((d) => d.cost)} max={maxCost} />
          <Text color={colors.dim}>  peak {formatUsd(maxCost)}</Text>
        </Box>
        <Box>
          <Box width={12}>
            <Text color={colors.textSecondary}>Tokens/day</Text>
          </Box>
          <Sparkline values={daily.map((d) => d.tokens)} max={maxTokens} />
          <Text color={colors.dim}>  peak {formatTokens(maxTokens)}</Text>
        </Box>
      </Box>

      {/* Two-column breakdown: agents + models */}
      <Box marginTop={1}>
        <Box flexDirection="column" width={36}>
          <Text color={colors.textSecondary} bold>Agents</Text>
          {topTools.length === 0 ? (
            <Text color={colors.dim}>(none)</Text>
          ) : (
            topTools.map(([name, count]) => (
              <Box key={name}>
                <Box width={20}><Text color={colors.textPrimary}>{name}</Text></Box>
                <Text color={colors.dim}>{count} sessions</Text>
              </Box>
            ))
          )}
        </Box>
        <Box flexDirection="column">
          <Text color={colors.textSecondary} bold>Models</Text>
          {topModels.length === 0 ? (
            <Text color={colors.dim}>(none)</Text>
          ) : (
            topModels.map(([name, count]) => (
              <Box key={name}>
                <Box width={28}><Text color={colors.textPrimary}>{name}</Text></Box>
                <Text color={colors.dim}>{count}x</Text>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* Providers + tool-use + MCP */}
      <Box marginTop={1}>
        <Box flexDirection="column" width={36}>
          <Text color={colors.textSecondary} bold>Providers</Text>
          {topProviders.length === 0 ? (
            <Text color={colors.dim}>(none)</Text>
          ) : (
            topProviders.map(([name, count]) => (
              <Box key={name}>
                <Box width={20}><Text color={colors.textPrimary}>{name}</Text></Box>
                <Text color={colors.dim}>{count} sessions</Text>
              </Box>
            ))
          )}
        </Box>
        <Box flexDirection="column">
          <Text color={colors.textSecondary} bold>Top agent tools</Text>
          {topAgentTools.length === 0 ? (
            <Text color={colors.dim}>(no tool usage recorded)</Text>
          ) : (
            topAgentTools.map(([name, count]) => (
              <Box key={name}>
                <Box width={20}><Text color={colors.textPrimary}>{name}</Text></Box>
                <Text color={colors.dim}>{count}x</Text>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {topMcps.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color={colors.textSecondary} bold>MCP servers</Text>
          {topMcps.map(([name, count]) => (
            <Box key={name}>
              <Box width={24}><Text color={colors.textPrimary}>{name}</Text></Box>
              <Text color={colors.dim}>{count}x</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color={colors.dim}>
          [Tab] Switch view    [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
