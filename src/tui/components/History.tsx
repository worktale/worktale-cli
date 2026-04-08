import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { getCommitCount, getAllCommitCount } from '../../db/commits.js';
import { getDailySummariesRange, getAllReposDailySummariesRange } from '../../db/daily-summaries.js';
import { getTopModules, getAllTopModules } from '../../db/file-activity.js';
import { getStreakInfo, getAllReposStreakInfo, getMostActiveMonth, getAllReposMostActiveMonth, getActiveDates, getAllActiveDates } from '../../utils/streaks.js';
import { formatNumber, getDateString } from '../../utils/formatting.js';
import { getDb } from '../../db/index.js';
import HeatmapGrid from './HeatmapGrid.js';
import StatBar from './StatBar.js';
import type { ModuleActivity } from '../../db/file-activity.js';

interface HistoryProps {
  repoIds: number[];
  multiRepo?: boolean;
}

export default function History({ repoIds, multiRepo }: HistoryProps) {
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [totalCommits, setTotalCommits] = useState(0);
  const [totalAdded, setTotalAdded] = useState(0);
  const [totalRemoved, setTotalRemoved] = useState(0);
  const [daysActive, setDaysActive] = useState(0);
  const [streakInfo, setStreakInfo] = useState({ current: 0, best: 0, bestStart: '', bestEnd: '' });
  const [mostActive, setMostActive] = useState({ month: '', commits: 0 });
  const [topModules, setTopModules] = useState<ModuleActivity[]>([]);
  const [milestones, setMilestones] = useState<Array<{ tag: string; date: string }>>([]);

  useEffect(() => {
    try {
      const today = getDateString();
      const yearAgo = new Date();
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      const startDate = getDateString(yearAgo);

      if (multiRepo) {
        const summaries = getAllReposDailySummariesRange(startDate, today);
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

        setTotalCommits(getAllCommitCount());
        setDaysActive(getAllActiveDates().length);
        setStreakInfo(getAllReposStreakInfo());
        setMostActive(getAllReposMostActiveMonth());
        setTopModules(getAllTopModules(8));

        // Milestones across all repos
        try {
          const db = getDb();
          const tagRows = db.prepare(`
            SELECT tags, date(timestamp) as d FROM commits
            WHERE tags IS NOT NULL AND tags != ''
            ORDER BY timestamp DESC
            LIMIT 10
          `).all() as Array<{ tags: string; d: string }>;

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
      } else {
        const repoId = repoIds[0];

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

        setTotalCommits(getCommitCount(repoId));
        setDaysActive(getActiveDates(repoId).length);
        setStreakInfo(getStreakInfo(repoId));
        setMostActive(getMostActiveMonth(repoId));
        setTopModules(getTopModules(repoId, 8));

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
      }
    } catch {
      // DB not ready
    }
  }, [repoIds, multiRepo]);

  const avgCommitsPerDay = daysActive > 0 ? (totalCommits / daysActive).toFixed(1) : '0';
  const maxModuleChanges = topModules.length > 0 ? topModules[0].changes : 1;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text color={colors.textSecondary} bold>Activity (Last 52 Weeks)</Text>
        <HeatmapGrid data={heatmapData} />
      </Box>

      {milestones.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.textSecondary} bold>Milestones</Text>
          {milestones.slice(0, 5).map((m, i) => (
            <Box key={i} paddingLeft={1}>
              <Text color={colors.streak}>{'\uD83C\uDFF7\uFE0F'}  </Text>
              <Text color={colors.textPrimary} bold>{m.tag}</Text>
              <Text color={colors.textSecondary}>  {m.date}</Text>
            </Box>
          ))}
        </Box>
      )}

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
        </Box>
      </Box>

      {topModules.length > 0 && (
        <Box flexDirection="column">
          <Text color={colors.textSecondary} bold>Top Modules</Text>
          <Box flexDirection="column" paddingLeft={1}>
            {topModules.map((mod, i) => (
              <StatBar
                key={i}
                label={mod.module}
                value={mod.changes}
                maxValue={maxModuleChanges}
                width={25}
              />
            ))}
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={colors.dim}>
          [Tab] Switch view    [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
