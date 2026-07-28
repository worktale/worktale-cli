import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { getCommitCount } from '../../db/commits.js';
import { getDailySummariesRange } from '../../db/daily-summaries.js';
import { getTopModules } from '../../db/file-activity.js';
import { getStreakInfo, getStreakInfoGlobal, getMostActiveMonth, getActiveDates } from '../../utils/streaks.js';
import { formatNumber, getDateString } from '../../utils/formatting.js';
import { getDb } from '../../db/index.js';
import HeatmapGrid from './HeatmapGrid.js';
import StatBar from './StatBar.js';
import type { ModuleActivity } from '../../db/file-activity.js';
import {
  getCombinedTopModules,
  getGlobalHeatmap,
  getAllTimeStats,
  getActiveDatesGlobal,
} from '../../db/aggregates.js';

interface HistoryProps {
  repoId: number;
  allRepos?: boolean;
}

interface RepoModuleEntry {
  module: string;
  changes: number;
}

export default function History({ repoId, allRepos }: HistoryProps) {
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [totalCommits, setTotalCommits] = useState(0);
  const [totalAdded, setTotalAdded] = useState(0);
  const [totalRemoved, setTotalRemoved] = useState(0);
  const [daysActive, setDaysActive] = useState(0);
  const [streakInfo, setStreakInfo] = useState({ current: 0, best: 0, bestStart: '', bestEnd: '' });
  const [mostActive, setMostActive] = useState({ month: '', commits: 0 });
  const [topModules, setTopModules] = useState<Array<ModuleActivity & { repo_name?: string }>>([]);
  const [milestones, setMilestones] = useState<Array<{ tag: string; date: string; repo_name?: string }>>([]);
  const [repoCount, setRepoCount] = useState(0);
  const [firstCommit, setFirstCommit] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (allRepos) {
        const heatMap = getGlobalHeatmap(365);
        setHeatmapData(heatMap);

        const stats = getAllTimeStats();
        setTotalCommits(stats.total_commits);
        setTotalAdded(stats.total_added);
        setTotalRemoved(stats.total_removed);
        setRepoCount(stats.repo_count);
        setFirstCommit(stats.first_commit);

        const activeDates = getActiveDatesGlobal();
        setDaysActive(activeDates.length);

        const streak = getStreakInfoGlobal();
        setStreakInfo(streak);

        const modules = getCombinedTopModules(8);
        setTopModules(modules.map((m) => ({ module: m.module, changes: m.changes, percentage: m.percentage, repo_name: m.repo_name })));

        // Milestones: tags joined with repo name
        try {
          const db = getDb();
          const tagRows = db.prepare(`
            SELECT c.tags, date(c.timestamp) as d, r.name as repo_name FROM commits c
            JOIN repos r ON r.id = c.repo_id
            WHERE c.tags IS NOT NULL AND c.tags != ''
            ORDER BY c.timestamp DESC
            LIMIT 10
          `).all() as Array<{ tags: string; d: string; repo_name: string }>;

          const ms: Array<{ tag: string; date: string; repo_name: string }> = [];
          for (const row of tagRows) {
            const tagList = row.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
            for (const tag of tagList) {
              ms.push({ tag, date: row.d, repo_name: row.repo_name });
            }
          }
          setMilestones(ms);
        } catch { /* tags not available */ }

        // Most-active-month not aggregated globally; leave blank in this view.
        setMostActive({ month: '', commits: 0 });
        return;
      }

      // Build heatmap data: last 52 weeks of daily summaries
      const today = getDateString();
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const startDate = getDateString(yearAgo);

      const summaries = getDailySummariesRange(repoId, startDate, today);
      const heatMap = new Map<string, number>();
      let addedSum = 0;
      let removedSum = 0;
      for (const s of summaries) {
        heatMap.set(s.date, s.commits_count);
        addedSum += s.lines_added;
        removedSum += s.lines_removed;
      }
      setHeatmapData(heatMap);
      setTotalAdded(addedSum);
      setTotalRemoved(removedSum);

      // Total commits
      const count = getCommitCount(repoId);
      setTotalCommits(count);

      // Active dates
      const activeDates = getActiveDates(repoId);
      setDaysActive(activeDates.length);

      // Streak info
      const streak = getStreakInfo(repoId);
      setStreakInfo(streak);

      // Most active month
      const active = getMostActiveMonth(repoId);
      setMostActive(active);

      // Top modules
      const modules = getTopModules(repoId, 8);
      setTopModules(modules);

      // Milestones (tags from commits)
      try {
        const db = getDb();
        const tagRows = db.prepare(`
          SELECT tags, date(timestamp) as d FROM commits
          WHERE repo_id = ? AND tags IS NOT NULL AND tags != ''
          ORDER BY timestamp DESC
          LIMIT 10
        `).all(repoId) as Array<{ tags: string; d: string }>;

        const ms: Array<{ tag: string; date: string }> = [];
        for (const row of tagRows) {
          const tagList = row.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          for (const tag of tagList) {
            ms.push({ tag, date: row.d });
          }
        }
        setMilestones(ms);
      } catch {
        // tags not available
      }
    } catch {
      // DB not ready
    }
  }, [repoId, allRepos]);

  const avgCommitsPerDay = daysActive > 0 ? (totalCommits / daysActive).toFixed(1) : '0';
  const maxModuleChanges = topModules.length > 0 ? topModules[0].changes : 1;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Year heatmap */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.textSecondary} bold>Activity (Last 52 Weeks)</Text>
        <HeatmapGrid data={heatmapData} />
      </Box>

      {/* Milestones */}
      {milestones.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.textSecondary} bold>Milestones</Text>
          {milestones.slice(0, 5).map((m, i) => (
            <Box key={i} paddingLeft={1}>
              <Text color={colors.streak}>{'\uD83C\uDFF7\uFE0F'}  </Text>
              <Text color={colors.textPrimary} bold>{m.tag}</Text>
              <Text color={colors.textSecondary}>  {m.date}</Text>
              {m.repo_name && <Text color={colors.dim}>  {m.repo_name}</Text>}
            </Box>
          ))}
        </Box>
      )}

      {/* All-time stats */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.textSecondary} bold>All-Time Stats</Text>
        <Box borderStyle="round" borderColor={colors.dim} paddingX={1} flexDirection="column">
          <Box>
            <Box width={28}>
              <Text color={colors.textSecondary}>Total commits:     </Text>
              <Text color={colors.brand} bold>{formatNumber(totalCommits)}</Text>
            </Box>
            <Box width={28}>
              <Text color={colors.textSecondary}>Lines written:     </Text>
              <Text color={colors.positive}>+{formatNumber(totalAdded)}</Text>
            </Box>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={colors.textSecondary}>Days active:       </Text>
              <Text color={colors.brand} bold>{formatNumber(daysActive)}</Text>
            </Box>
            <Box width={28}>
              <Text color={colors.textSecondary}>Lines removed:     </Text>
              <Text color={colors.negative}>-{formatNumber(totalRemoved)}</Text>
            </Box>
          </Box>
          <Box>
            <Box width={28}>
              <Text color={colors.textSecondary}>Avg commits/day:   </Text>
              <Text color={colors.brand}>{avgCommitsPerDay}</Text>
            </Box>
            <Box width={28}>
              <Text color={colors.textSecondary}>Longest streak:    </Text>
              <Text color={colors.streak}>{streakInfo.best} days</Text>
            </Box>
          </Box>
          {allRepos ? (
            <Box>
              <Box width={28}>
                <Text color={colors.textSecondary}>Repos tracked:     </Text>
                <Text color={colors.brand} bold>{formatNumber(repoCount)}</Text>
              </Box>
              <Box width={28}>
                <Text color={colors.textSecondary}>First commit:      </Text>
                <Text color={colors.brand}>{firstCommit ?? '--'}</Text>
              </Box>
            </Box>
          ) : (
            <Box>
              <Box width={28}>
                <Text color={colors.textSecondary}>Most active month: </Text>
                <Text color={colors.brand}>{mostActive.month || '--'}</Text>
              </Box>
              <Box width={28}>
                <Text color={colors.textSecondary}>                   </Text>
                <Text color={colors.textSecondary}>{mostActive.commits > 0 ? `${formatNumber(mostActive.commits)} commits` : ''}</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Top modules */}
      {topModules.length > 0 && (
        <Box flexDirection="column">
          <Text color={colors.textSecondary} bold>Top Modules</Text>
          <Box flexDirection="column" paddingLeft={1}>
            {topModules.map((mod, i) => (
              <StatBar
                key={i}
                label={mod.repo_name ? `${mod.repo_name}:${mod.module}` : mod.module}
                value={mod.changes}
                maxValue={maxModuleChanges}
                width={25}
              />
            ))}
          </Box>
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
