import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { getRepo } from '../db/repos.js';
import { getStreakInfo, getAllReposStreakInfo } from '../utils/streaks.js';
import { colors } from './theme.js';
import Header from './components/Header.js';
import Overview from './components/Overview.js';
import DailyLog from './components/DailyLog.js';
import History from './components/History.js';

interface AppProps {
  repoPath?: string;
  multiRepo?: boolean;
  repoIds?: number[];
  onAction?: (action: 'digest' | 'publish') => void;
}

export default function App({ repoPath, multiRepo, repoIds, onAction }: AppProps) {
  const { exit } = useApp();
  const [activeView, setActiveView] = useState<1 | 2 | 3>(1);
  const [displayName, setDisplayName] = useState('');
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [resolvedRepoIds, setResolvedRepoIds] = useState<number[]>([]);

  useEffect(() => {
    try {
      if (multiRepo && repoIds) {
        setResolvedRepoIds(repoIds);
        setDisplayName(`All Repos (${repoIds.length})`);

        const streakInfo = getAllReposStreakInfo();
        setStreak(streakInfo.current);
      } else if (repoPath) {
        const r = getRepo(repoPath);
        if (!r) {
          setError(`Repository not found: ${repoPath}\nRun "worktale init" first.`);
          return;
        }
        setResolvedRepoIds([r.id]);
        setDisplayName(r.name);

        const streakInfo = getStreakInfo(r.id);
        setStreak(streakInfo.current);
      }
    } catch (err) {
      setError(`Failed to load repository data: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [repoPath, multiRepo, repoIds]);

  useInput((input, key) => {
    if (isEditing) return;

    if (input === 'q') {
      exit();
      return;
    }
    if (input === 'd' || input === 'D') {
      onAction?.('digest');
      exit();
      return;
    }
    if (input === 'p' || input === 'P') {
      onAction?.('publish');
      exit();
      return;
    }
    if (input === '1') setActiveView(1);
    if (input === '2') setActiveView(2);
    if (input === '3') setActiveView(3);
    if (key.tab) {
      setActiveView((prev) => (prev === 3 ? 1 : ((prev + 1) as 1 | 2 | 3)));
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={colors.negative} bold>Error</Text>
        <Text color={colors.textSecondary}>{error}</Text>
      </Box>
    );
  }

  const { stdout } = useStdout();
  const termHeight = stdout.rows || 24;

  if (resolvedRepoIds.length === 0) {
    return (
      <Box paddingX={1} height={termHeight}>
        <Text color={colors.textSecondary}>Loading...</Text>
      </Box>
    );
  }

  const isMulti = resolvedRepoIds.length > 1;

  return (
    <Box flexDirection="column" height={termHeight}>
      <Header repoName={displayName} streak={streak} activeView={activeView} />
      <Box flexGrow={1}>
        {activeView === 1 && <Overview repoIds={resolvedRepoIds} multiRepo={isMulti} />}
        {activeView === 2 && <DailyLog repoIds={resolvedRepoIds} multiRepo={isMulti} onEditingChange={setIsEditing} />}
        {activeView === 3 && <History repoIds={resolvedRepoIds} multiRepo={isMulti} />}
      </Box>
    </Box>
  );
}
