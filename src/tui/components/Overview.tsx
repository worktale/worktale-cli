import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { getCommitsByDate, getRecentCommits } from '../../db/commits.js';
import { getDailySummary, getDailySummariesRange } from '../../db/daily-summaries.js';
import { getStreakInfo, getStreakInfoGlobal } from '../../utils/streaks.js';
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
import {
  getAggregatedDailySummary,
  getRecentCommitsAcrossRepos,
  getGlobalHeatmap,
  type CommitWithRepo,
} from '../../db/aggregates.js';

interface OverviewProps {
  repoId: number;
  allRepos?: boolean;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function Overview({ repoId, allRepos }: OverviewProps) {
  const [todayStr] = useState(() => getDateString());
  const [todayCommits, setTodayCommits] = useState<Array<Commit | CommitWithRepo>>([]);
  const [todayAggregate, setTodayAggregate] = useState<{ commits_count: number; lines_added: number; lines_removed: number; files_touched: number; repo_count: number } | null>(null);
  const [todaySummary, setTodaySummary] = useState<DailySummary | undefined>(undefined);
  const [streakInfo, setStreakInfo] = useState({ current: 0, best: 0, bestStart: '', bestEnd: '' });
  const [weekData, setWeekData] = useState<Array<{ day: string; value: number; isToday: boolean }>>([]);
  const [recentCommits, setRecentCommits] = useState<Array<Commit | CommitWithRepo>>([]);

  useEffect(() => {
    try {
      if (allRepos) {
        // Aggregate today across all repos
        const agg = getAggregatedDailySummary(todayStr);
        setTodayAggregate(agg);

        // Global streak
        const streak = getStreakInfoGlobal();
        setStreakInfo(streak);

        // Week data — sum across repos
        const weekDates = getWeekDates();
        const heatmap = getGlobalHeatmap(14);
        const chartData = weekDates.map((date, i) => ({
          day: DAY_NAMES[i],
          value: heatmap.get(date) ?? 0,
          isToday: date === todayStr,
        }));
        setWeekData(chartData);

        // Recent commits with repo names
        const recent = getRecentCommitsAcrossRepos(5);
        setRecentCommits(recent);
        setTodayCommits([]);
        return;
      }

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
  }, [repoId, todayStr, allRepos]);

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

  const todayCommitCount = allRepos
    ? todayAggregate?.commits_count ?? 0
    : todayCommits.length;
  const todayAdded = allRepos
    ? todayAggregate?.lines_added ?? 0
    : todaySummary?.lines_added ?? todayCommits.reduce((s, c) => s + c.lines_added, 0);
  const todayRemoved = allRepos
    ? todayAggregate?.lines_removed ?? 0
    : todaySummary?.lines_removed ?? todayCommits.reduce((s, c) => s + c.lines_removed, 0);
  const todayFiles = allRepos
    ? todayAggregate?.files_touched ?? 0
    : todaySummary?.files_touched ?? todayCommits.reduce((s, c) => s + c.files_changed, 0);
  const activeRepoCount = todayAggregate?.repo_count ?? 0;

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
            <Text color={colors.brand} bold>{formatNumber(todayCommitCount)}</Text>
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
          {allRepos ? (
            <Box>
              <Text color={colors.brand}>{formatNumber(activeRepoCount)}</Text>
              <Text color={colors.textSecondary}> repo{activeRepoCount !== 1 ? 's' : ''} active</Text>
            </Box>
          ) : (
            <Box>
              <Text color={colors.brand}>{estimatedTime}</Text>
              <Text color={colors.textSecondary}> coding</Text>
            </Box>
          )}
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
            repoName: 'repo_name' in c ? (c as CommitWithRepo).repo_name : undefined,
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
