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

  const hasRepoNames = commits.some(c => c.repoName);

  return (
    <Box flexDirection="column">
      {commits.map((commit, index) => {
        const timeStr = formatRelativeTime(commit.timestamp);
        const msg = commit.message ?? '(no message)';
        const maxMsgLen = hasRepoNames ? 45 : 60;
        const truncated = msg.length > maxMsgLen ? msg.slice(0, maxMsgLen - 3) + '...' : msg;

        return (
          <Box key={commit.sha || index}>
            <Text color={colors.brand}>{'\u25CF'} </Text>
            <Box width={12}>
              <Text color={colors.textSecondary}>{timeStr.padEnd(12)}</Text>
            </Box>
            {hasRepoNames && (
              <Box width={16}>
                <Text color={colors.dim}>{(commit.repoName ?? '').padEnd(16)}</Text>
              </Box>
            )}
            <Text color={colors.textPrimary}>{truncated}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
