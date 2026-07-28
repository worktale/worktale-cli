import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../theme.js';
import { formatRelativeTime } from '../../utils/formatting.js';

interface TimelineCommit {
  sha: string;
  message: string;
  timestamp: string;
  repoName?: string;
}

interface CommitTimelineProps {
  commits: TimelineCommit[];
}

export default function CommitTimeline({ commits }: CommitTimelineProps) {
  if (commits.length === 0) {
    return (
      <Box paddingLeft={1}>
        <Text color={colors.textSecondary}>No commits to show.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {commits.map((commit, index) => {
        const timeStr = formatRelativeTime(commit.timestamp);
        const msg = commit.message ?? '(no message)';
        // Truncate long messages (leave room for repo prefix when present)
        const maxLen = commit.repoName ? 50 : 60;
        const truncated = msg.length > maxLen ? msg.slice(0, maxLen - 3) + '...' : msg;

        return (
          <Box key={commit.sha || index}>
            <Text color={colors.brand}>{'●'} </Text>
            <Box width={12}>
              <Text color={colors.textSecondary}>{timeStr.padEnd(12)}</Text>
            </Box>
            {commit.repoName && (
              <Box width={Math.min(commit.repoName.length + 3, 22)}>
                <Text color={colors.streak}>[{commit.repoName}]</Text>
                <Text> </Text>
              </Box>
            )}
            <Text color={colors.textPrimary}>{truncated}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
