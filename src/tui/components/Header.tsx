import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';

interface HeaderProps {
  repoName: string;
  streak: number;
  activeView: 1 | 2 | 3;
}

const tabs = [
  { key: 1 as const, label: 'Overview' },
  { key: 2 as const, label: 'Daily Log' },
  { key: 3 as const, label: 'History' },
];

export default function Header({ repoName, streak, activeView }: HeaderProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.brand}
      paddingX={1}
    >
      {/* Top row: brand + repo name + streak */}
      <Box justifyContent="space-between">
        <Box>
          <Text color={colors.streak}>{'\u26A1'} </Text>
          <Text bold color={colors.brand}>WORKTALE</Text>
          <Text color={colors.dim}>  {'\u2502'}  </Text>
          <Text color={colors.textPrimary}>{repoName}</Text>
        </Box>
        <Box>
          <Text color={colors.streak}>
            {'\u26A1'} Streak: {streak} day{streak !== 1 ? 's' : ''}
          </Text>
        </Box>
      </Box>

      {/* Bottom row: tab navigation + quit hint */}
      <Box justifyContent="space-between">
        <Box>
          {tabs.map((tab) => {
            const isActive = activeView === tab.key;
            return (
              <Box key={tab.key} marginRight={2}>
                {isActive ? (
                  <Text bold color={colors.brand}>
                    [{tab.key}] {tab.label}
                  </Text>
                ) : (
                  <Text color={colors.textSecondary}>
                    [{tab.key}] {tab.label}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
        <Text color={colors.dim}>q to quit</Text>
      </Box>
    </Box>
  );
}
