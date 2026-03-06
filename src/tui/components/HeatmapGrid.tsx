import React from 'react';
import { Box, Text } from 'ink';
import { heatChar, colors } from '../theme.js';

interface HeatmapGridProps {
  data: Map<string, number>;
}

function getHeatLevel(count: number): 0 | 1 | 2 | 3 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts JS Date.getDay() (0=Sun..6=Sat) to ISO row index (0=Mon..6=Sun).
 */
function isoRow(jsDow: number): number {
  return jsDow === 0 ? 6 : jsDow - 1;
}

export default function HeatmapGrid({ data }: HeatmapGridProps) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Grid: 7 rows (Mon=0 .. Sun=6) x ~53 columns (weeks)
  // End date = today. Start date = 52 weeks before the Monday of this week.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the Monday of this week
  const todayRow = isoRow(today.getDay());
  const thisMon = new Date(today);
  thisMon.setDate(thisMon.getDate() - todayRow);

  // Start 52 weeks before this Monday
  const startMon = new Date(thisMon);
  startMon.setDate(startMon.getDate() - 52 * 7);

  // Total number of weeks (columns)
  const totalWeeks = 53; // 52 full weeks + current partial week

  // Build grid: grid[row][col] = commit count (or -1 for future/empty)
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: totalWeeks }, () => -1),
  );

  // Track month labels: when column's Monday falls in a new month
  const monthLabelMap = new Map<number, string>();

  for (let week = 0; week < totalWeeks; week++) {
    for (let row = 0; row < 7; row++) {
      const d = new Date(startMon);
      d.setDate(d.getDate() + week * 7 + row);

      if (d > today) {
        grid[row][week] = -1; // future date
        continue;
      }

      const dateStr = formatDateStr(d);
      const count = data.get(dateStr) ?? 0;
      grid[row][week] = count;

      // Record month label on Monday (row 0)
      if (row === 0) {
        const m = d.getMonth();
        if (!monthLabelMap.has(week)) {
          // Check if this is the first week or a new month
          if (week === 0) {
            monthLabelMap.set(week, monthNames[m]);
          } else {
            const prevMon = new Date(startMon);
            prevMon.setDate(prevMon.getDate() + (week - 1) * 7);
            if (prevMon.getMonth() !== m) {
              monthLabelMap.set(week, monthNames[m]);
            }
          }
        }
      }
    }
  }

  // Build month labels row
  let monthRow = '    '; // offset for day labels
  let cursor = 0;
  for (let week = 0; week < totalWeeks; week++) {
    const label = monthLabelMap.get(week);
    if (label && week >= cursor) {
      const padding = week - cursor;
      monthRow += ' '.repeat(padding);
      monthRow += label;
      cursor = week + label.length;
    }
  }

  const dayLabels = ['Mon', '   ', 'Wed', '   ', 'Fri', '   ', 'Sun'];

  return (
    <Box flexDirection="column">
      <Text color={colors.textSecondary}>{monthRow}</Text>
      {dayLabels.map((dayLabel, rowIdx) => {
        let row = '';
        for (let week = 0; week < totalWeeks; week++) {
          const val = grid[rowIdx][week];
          if (val < 0) {
            row += ' ';
          } else {
            row += heatChar(getHeatLevel(val));
          }
        }
        return (
          <Box key={rowIdx}>
            <Box width={4}>
              <Text color={colors.textSecondary}>{dayLabel} </Text>
            </Box>
            <Text>{row}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color={colors.textSecondary}>Less </Text>
        <Text>{heatChar(0)}{heatChar(1)}{heatChar(2)}{heatChar(3)}</Text>
        <Text color={colors.textSecondary}> More</Text>
      </Box>
    </Box>
  );
}
