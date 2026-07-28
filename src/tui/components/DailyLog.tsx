import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../theme.js';
import { getCommitsByDate } from '../../db/commits.js';
import { getDailySummary, updateUserNotes } from '../../db/daily-summaries.js';
import {
  formatDate,
  formatNumber,
  getDateString,
} from '../../utils/formatting.js';
import CommitTimeline from './CommitTimeline.js';
import type { Commit } from '../../db/commits.js';
import type { DailySummary } from '../../db/daily-summaries.js';
import {
  getCommitsByDateAcrossRepos,
  getAggregatedDailySummary,
  getPerRepoDailySummary,
  type CommitWithRepo,
  type DailySummaryWithRepo,
} from '../../db/aggregates.js';

interface DailyLogProps {
  repoId: number;
  allRepos?: boolean;
  onEditingChange?: (editing: boolean) => void;
}

interface PerRepoBucket {
  repo_name: string;
  commits: CommitWithRepo[];
  summary: DailySummaryWithRepo;
}

export default function DailyLog({ repoId, allRepos, onEditingChange }: DailyLogProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [commits, setCommits] = useState<Commit[]>([]);
  const [crossRepoCommits, setCrossRepoCommits] = useState<CommitWithRepo[]>([]);
  const [perRepo, setPerRepo] = useState<PerRepoBucket[]>([]);
  const [aggregate, setAggregate] = useState<{ commits_count: number; lines_added: number; lines_removed: number; files_touched: number; repo_count: number } | null>(null);
  const [summary, setSummary] = useState<DailySummary | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  const dateStr = getDateString(currentDate);

  const loadData = useCallback(() => {
    try {
      if (allRepos) {
        const all = getCommitsByDateAcrossRepos(dateStr);
        setCrossRepoCommits(all);

        const perRepoSummaries = getPerRepoDailySummary(dateStr);
        const buckets: PerRepoBucket[] = perRepoSummaries.map((s) => ({
          repo_name: s.repo_name,
          summary: s,
          commits: all.filter((c) => c.repo_id === s.repo_id),
        }));
        setPerRepo(buckets);

        setAggregate(getAggregatedDailySummary(dateStr));
        setCommits([]);
        setSummary(undefined);
        setNotesDraft('');
        return;
      }

      const dayCommits = getCommitsByDate(repoId, dateStr);
      setCommits(dayCommits);

      const daySummary = getDailySummary(repoId, dateStr);
      setSummary(daySummary);

      setNotesDraft(daySummary?.user_notes ?? '');
    } catch {
      setCommits([]);
      setCrossRepoCommits([]);
      setPerRepo([]);
      setAggregate(null);
      setSummary(undefined);
      setNotesDraft('');
    }
  }, [repoId, dateStr, allRepos]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useInput((input, key) => {
    if (isEditing) {
      // When editing, only handle Escape/Enter to exit editing
      if (key.escape) {
        setIsEditing(false);
        // Revert draft
        setNotesDraft(summary?.user_notes ?? '');
      }
      return;
    }

    if (key.leftArrow) {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() - 1);
        return d;
      });
    }
    if (key.rightArrow) {
      setCurrentDate((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 1);
        return d;
      });
    }
    if ((input === 'e' || input === 'E') && !allRepos) {
      setIsEditing(true);
    }
  });

  const handleNotesSubmit = (value: string) => {
    try {
      updateUserNotes(repoId, dateStr, value);
      setNotesDraft(value);
    } catch {
      // ignore write errors
    }
    setIsEditing(false);
    loadData();
  };

  const todayStr = getDateString();
  const isToday = dateStr === todayStr;

  const totalCount = allRepos ? aggregate?.commits_count ?? 0 : commits.length;
  const totalAdded = allRepos
    ? aggregate?.lines_added ?? 0
    : summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0);
  const totalRemoved = allRepos
    ? aggregate?.lines_removed ?? 0
    : summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0);
  const totalFiles = allRepos
    ? aggregate?.files_touched ?? 0
    : summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Date navigation */}
      <Box marginBottom={1}>
        <Text color={colors.dim}>{'◀'} </Text>
        <Text color={colors.textPrimary} bold>
          {formatDate(dateStr)}
        </Text>
        <Text color={colors.dim}> {'▶'}</Text>
        {isToday && <Text color={colors.streak}>  (today)</Text>}
        {allRepos && aggregate && aggregate.repo_count > 0 && (
          <Text color={colors.textSecondary}>  {aggregate.repo_count} repo{aggregate.repo_count !== 1 ? 's' : ''} active</Text>
        )}
      </Box>

      {/* Day stats */}
      <Box borderStyle="round" borderColor={colors.dim} flexDirection="column" paddingX={1}>
        <Text color={colors.textSecondary} bold> Activity </Text>
        {totalCount === 0 ? (
          <Text color={colors.textSecondary}>No commits on this day.</Text>
        ) : (
          <Box>
            <Box width={20}>
              <Text color={colors.brand} bold>{formatNumber(totalCount)}</Text>
              <Text color={colors.textSecondary}> commits</Text>
            </Box>
            <Box width={24}>
              <Text color={colors.positive}>+{formatNumber(totalAdded)}</Text>
              <Text color={colors.textSecondary}> / </Text>
              <Text color={colors.negative}>-{formatNumber(totalRemoved)}</Text>
            </Box>
            <Box>
              <Text color={colors.brand}>{formatNumber(totalFiles)}</Text>
              <Text color={colors.textSecondary}> files touched</Text>
            </Box>
          </Box>
        )}
      </Box>

      {/* User notes (single-repo only) */}
      {!allRepos && (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color={colors.textSecondary} bold>Notes </Text>
            {!isEditing && (
              <Text color={colors.dim}>[E to edit]</Text>
            )}
          </Box>
          {isEditing ? (
            <Box borderStyle="round" borderColor={colors.brand} paddingX={1}>
              <TextInput
                value={notesDraft}
                onChange={setNotesDraft}
                onSubmit={handleNotesSubmit}
                placeholder="Write your notes for the day... (Enter to save, Esc to cancel)"
                focus={true}
              />
            </Box>
          ) : (
            <Box paddingLeft={1}>
              {notesDraft ? (
                <Text color={colors.textPrimary}>{notesDraft}</Text>
              ) : (
                <Text color={colors.dim} italic>No notes yet. Press E to add notes.</Text>
              )}
            </Box>
          )}
        </Box>
      )}

      {allRepos && (
        <Box marginTop={1} flexDirection="column">
          <Text color={colors.dim} italic>Notes are per-repo — switch to a single-repo view to edit.</Text>
        </Box>
      )}

      {/* AI Draft (single-repo only) */}
      {!allRepos && summary?.ai_draft && (
        <Box marginTop={1} flexDirection="column">
          <Text color={colors.textSecondary} bold>AI Summary</Text>
          <Box paddingLeft={1}>
            <Text color={colors.textPrimary}>{summary.ai_draft}</Text>
          </Box>
        </Box>
      )}

      {/* Commit timeline */}
      <Box marginTop={1} flexDirection="column">
        <Box marginBottom={0}>
          <Text color={colors.textSecondary} bold>Commits</Text>
        </Box>
        {allRepos ? (
          perRepo.length === 0 ? (
            <CommitTimeline commits={[]} />
          ) : (
            perRepo.map((bucket) => (
              <Box key={bucket.repo_name} flexDirection="column" marginTop={1}>
                <Box>
                  <Text color={colors.streak} bold>{bucket.repo_name}</Text>
                  <Text color={colors.textSecondary}>  {bucket.summary.commits_count} commit{bucket.summary.commits_count !== 1 ? 's' : ''}, </Text>
                  <Text color={colors.positive}>+{formatNumber(bucket.summary.lines_added)}</Text>
                  <Text color={colors.textSecondary}> / </Text>
                  <Text color={colors.negative}>-{formatNumber(bucket.summary.lines_removed)}</Text>
                </Box>
                <CommitTimeline
                  commits={bucket.commits.map((c) => ({
                    sha: c.sha,
                    message: c.message ?? '',
                    timestamp: c.timestamp,
                  }))}
                />
              </Box>
            ))
          )
        ) : (
          <CommitTimeline
            commits={commits.map((c) => ({
              sha: c.sha,
              message: c.message ?? '',
              timestamp: c.timestamp,
            }))}
          />
        )}
      </Box>

      {/* Footer hints */}
      <Box marginTop={1}>
        <Text color={colors.dim}>
          [{'←'}/{'→'}] Navigate days    {allRepos ? '' : '[E] Edit notes    '}[Tab] Switch view
        </Text>
      </Box>
    </Box>
  );
}
