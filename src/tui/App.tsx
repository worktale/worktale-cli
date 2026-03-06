import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { getRepo } from '../db/repos.js';
import { getStreakInfo } from '../utils/streaks.js';
import { colors } from './theme.js';
import Header from './components/Header.js';
import Overview from './components/Overview.js';
import DailyLog from './components/DailyLog.js';
import History from './components/History.js';
import type { Repo } from '../db/repos.js';

interface AppProps {
  repoPath: string;
}

export default function App({ repoPath }: AppProps) {
  const { exit } = useApp();
  const [activeView, setActiveView] = useState<1 | 2 | 3>(1);
  const [repo, setRepo] = useState<Repo | undefined>(undefined);
  const [streak, setStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const r = getRepo(repoPath);
      if (!r) {
        setError(`Repository not found: ${repoPath}\nRun "worktale init" first.`);
        return;
      }
      setRepo(r);

      const streakInfo = getStreakInfo(r.id);
      setStreak(streakInfo.current);
    } catch (err) {
      setError(`Failed to load repository data: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [repoPath]);

  useInput((input, key) => {
    if (input === 'q') {
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

  if (!repo) {
    return (
      <Box paddingX={1} height={termHeight}>
        <Text color={colors.textSecondary}>Loading...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={termHeight}>
      <Header repoName={repo.name} streak={streak} activeView={activeView} />
      <Box flexGrow={1}>
        {activeView === 1 && <Overview repoId={repo.id} />}
        {activeView === 2 && <DailyLog repoId={repo.id} />}
        {activeView === 3 && <History repoId={repo.id} />}
      </Box>
    </Box>
  );
}
