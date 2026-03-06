import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { formatNumber } from '../../utils/formatting.js';

interface WeekChartDay {
  day: string;
  value: number;
  isToday: boolean;
}

interface WeekChartProps {
  data: WeekChartDay[];
}

export default function WeekChart({ data }: WeekChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barMaxWidth = 30;

  return (
    <Box flexDirection="column">
      {data.map((entry, index) => {
        const barLen = Math.round((entry.value / maxValue) * barMaxWidth);
        const filled = barLen > 0 ? '\u2588'.repeat(barLen) : '\u2591'.repeat(4);
        const barColor = barLen > 0 ? colors.brand : colors.dim;
        const label = entry.value > 0 ? `  ${formatNumber(entry.value)} lines` : '';
        const todayIndicator = entry.isToday ? '  \u2190 today' : '';

        return (
          <Box key={index}>
            <Box width={5}>
              <Text color={entry.isToday ? colors.textPrimary : colors.textSecondary}>
                {entry.day.padEnd(5)}
              </Text>
            </Box>
            <Text color={barColor}>{filled}</Text>
            <Text color={colors.textSecondary}>{label}</Text>
            <Text color={colors.streak}>{todayIndicator}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
