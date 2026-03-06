import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { getCommitsByDate, getRecentCommits } from '../../db/commits.js';
import { getDailySummary, getDailySummariesRange } from '../../db/daily-summaries.js';
import { getStreakInfo } from '../../utils/streaks.js';
import {
  formatDate,
  formatNumber,
  formatLines,
  getDateString,
  getWeekDates,
} from '../../utils/formatting.js';
import StreakCounter from './StreakCounter.js';
import WeekChart from './WeekChart.js';
import CommitTimeline from './CommitTimeline.js';
import type { Commit } from '../../db/commits.js';
import type { DailySummary } from '../../db/daily-summaries.js';

interface OverviewProps {
  repoId: number;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function Overview({ repoId }: OverviewProps) {
  const [todayStr] = useState(() => getDateString());
  const [todayCommits, setTodayCommits] = useState<Commit[]>([]);
  const [todaySummary, setTodaySummary] = useState<DailySummary | undefined>(undefined);
  const [streakInfo, setStreakInfo] = useState({ current: 0, best: 0, bestStart: '', bestEnd: '' });
  const [weekData, setWeekData] = useState<Array<{ day: string; value: number; isToday: boolean }>>([]);
  const [recentCommits, setRecentCommits] = useState<Commit[]>([]);

  useEffect(() => {
    try {
      // Today's commits
      const commits = getCommitsByDate(repoId, todayStr);
      setTodayCommits(commits);

      // Today's summary
      const summary = getDailySummary(repoId, todayStr);
      setTodaySummary(summary);

      // Streak
      const streak = getStreakInfo(repoId);
      setStreakInfo(streak);

      // Week data
      const weekDates = getWeekDates();
      const weekSummaries = getDailySummariesRange(
        repoId,
        weekDates[0],
        weekDates[weekDates.length - 1],
      );
      const summaryMap = new Map(weekSummaries.map((s) => [s.date, s]));
      const chartData = weekDates.map((date, i) => {
        const s = summaryMap.get(date);
        return {
          day: DAY_NAMES[i],
          value: s ? s.lines_added : 0,
          isToday: date === todayStr,
        };
      });
      setWeekData(chartData);

      // Recent commits
      const recent = getRecentCommits(repoId, 5);
      setRecentCommits(recent);
    } catch {
      // DB not ready or no data — leave defaults
    }
  }, [repoId, todayStr]);

  // Estimate time coding: time span between first and last commit of the day
  let estimatedTime = '';
  if (todayCommits.length >= 2) {
    const first = new Date(todayCommits[0].timestamp).getTime();
    const last = new Date(todayCommits[todayCommits.length - 1].timestamp).getTime();
    const diffMinutes = Math.round((last - first) / 60_000);
    if (diffMinutes < 60) {
      estimatedTime = `${diffMinutes}m`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      estimatedTime = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
  } else if (todayCommits.length === 1) {
    estimatedTime = '< 1m';
  } else {
    estimatedTime = '--';
  }

  const todayAdded = todaySummary?.lines_added ?? todayCommits.reduce((s, c) => s + c.lines_added, 0);
  const todayRemoved = todaySummary?.lines_removed ?? todayCommits.reduce((s, c) => s + c.lines_removed, 0);
  const todayFiles = todaySummary?.files_touched ?? todayCommits.reduce((s, c) => s + c.files_changed, 0);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Date */}
      <Box marginBottom={1}>
        <Text color={colors.textPrimary} bold>{formatDate(todayStr)}</Text>
      </Box>

      {/* Today's stats */}
      <Box borderStyle="round" borderColor={colors.dim} flexDirection="column" paddingX={1} paddingY={0}>
        <Text color={colors.textSecondary} bold> Today </Text>
        <Box>
          <Box width={24}>
            <Text color={colors.brand} bold>{formatNumber(todayCommits.length)}</Text>
            <Text color={colors.textSecondary}> commits</Text>
          </Box>
          <Box width={24}>
            <Text color={colors.positive}>+{formatNumber(todayAdded)}</Text>
            <Text color={colors.textSecondary}> / </Text>
            <Text color={colors.negative}>-{formatNumber(todayRemoved)}</Text>
          </Box>
          <Box width={20}>
            <Text color={colors.brand}>{formatNumber(todayFiles)}</Text>
            <Text color={colors.textSecondary}> files</Text>
          </Box>
          <Box>
            <Text color={colors.brand}>{estimatedTime}</Text>
            <Text color={colors.textSecondary}> coding</Text>
          </Box>
        </Box>
      </Box>

      {/* Streak */}
      <Box marginTop={1} flexDirection="column">
        <StreakCounter current={streakInfo.current} best={streakInfo.best} />
      </Box>

      {/* Week chart */}
      <Box marginTop={1} flexDirection="column">
        <Box marginBottom={0}>
          <Text color={colors.textSecondary} bold>This Week</Text>
        </Box>
        <WeekChart data={weekData} />
      </Box>

      {/* Recent commits */}
      <Box marginTop={1} flexDirection="column">
        <Box marginBottom={0}>
          <Text color={colors.textSecondary} bold>Recent Commits</Text>
        </Box>
        <CommitTimeline
          commits={recentCommits.map((c) => ({
            sha: c.sha,
            message: c.message ?? '',
            timestamp: c.timestamp,
          }))}
        />
      </Box>

      {/* Footer hints */}
      <Box marginTop={1}>
        <Text color={colors.dim}>
          [D] Generate digest    [P] Publish    [Tab] Switch view    [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
