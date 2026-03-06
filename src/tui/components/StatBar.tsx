import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface StatBarProps {
  label: string;
  value: number;
  maxValue: number;
  width?: number;
}

export default function StatBar({ label, value, maxValue, width = 30 }: StatBarProps) {
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const filledCount = Math.round(ratio * width);
  const emptyCount = width - filledCount;
  const percentage = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;

  const filled = '\u2588'.repeat(filledCount);
  const empty = '\u2591'.repeat(emptyCount);

  return (
    <Box>
      <Box width={18}>
        <Text color={colors.textSecondary}>{label.padEnd(18)}</Text>
      </Box>
      <Text color={colors.brand}>{filled}</Text>
      <Text color={colors.dim}>{empty}</Text>
      <Text color={colors.textSecondary}>{`  ${percentage}%`}</Text>
    </Box>
  );
}
