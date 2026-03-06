import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface StreakCounterProps {
  current: number;
  best: number;
}

export default function StreakCounter({ current, best }: StreakCounterProps) {
  const maxVal = Math.max(current, best, 1);
  const barWidth = 30;

  const currentBarLen = Math.round((current / maxVal) * barWidth);
  const bestBarLen = Math.round((best / maxVal) * barWidth);

  const currentBar = '\u2501'.repeat(currentBarLen);
  const bestBar = '\u2501'.repeat(bestBarLen);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={colors.streak}>{'\uD83D\uDD25'} STREAK  </Text>
        <Text color={colors.streak}>{currentBar}</Text>
        <Text color={colors.textPrimary}>{`  ${current} day${current !== 1 ? 's' : ''}`}</Text>
      </Box>
      <Box>
        <Text color={colors.textSecondary}>{'\uD83D\uDCC8'} BEST    </Text>
        <Text color={colors.textSecondary}>{bestBar}</Text>
        <Text color={colors.textPrimary}>{`  ${best} day${best !== 1 ? 's' : ''}`}</Text>
      </Box>
    </Box>
  );
}
