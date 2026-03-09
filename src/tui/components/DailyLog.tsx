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

interface DailyLogProps {
  repoId: number;
  onEditingChange?: (editing: boolean) => void;
}

export default function DailyLog({ repoId, onEditingChange }: DailyLogProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [commits, setCommits] = useState<Commit[]>([]);
  const [summary, setSummary] = useState<DailySummary | undefined>(undefined);
  const [isEditing, setIsEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  const dateStr = getDateString(currentDate);

  const loadData = useCallback(() => {
    try {
      const dayCommits = getCommitsByDate(repoId, dateStr);
      setCommits(dayCommits);

      const daySummary = getDailySummary(repoId, dateStr);
      setSummary(daySummary);

      setNotesDraft(daySummary?.user_notes ?? '');
    } catch {
      setCommits([]);
      setSummary(undefined);
      setNotesDraft('');
    }
  }, [repoId, dateStr]);

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
    if (input === 'e' || input === 'E') {
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

  const totalAdded = summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0);
  const totalRemoved = summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0);
  const totalFiles = summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Date navigation */}
      <Box marginBottom={1}>
        <Text color={colors.dim}>{'\u25C0'} </Text>
        <Text color={colors.textPrimary} bold>
          {formatDate(dateStr)}
        </Text>
        <Text color={colors.dim}> {'\u25B6'}</Text>
        {isToday && <Text color={colors.streak}>  (today)</Text>}
      </Box>

      {/* Day stats */}
      <Box borderStyle="round" borderColor={colors.dim} flexDirection="column" paddingX={1}>
        <Text color={colors.textSecondary} bold> Activity </Text>
        {commits.length === 0 ? (
          <Text color={colors.textSecondary}>No commits on this day.</Text>
        ) : (
          <Box>
            <Box width={20}>
              <Text color={colors.brand} bold>{formatNumber(commits.length)}</Text>
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

      {/* User notes */}
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

      {/* AI Draft */}
      {summary?.ai_draft && (
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
        <CommitTimeline
          commits={commits.map((c) => ({
            sha: c.sha,
            message: c.message ?? '',
            timestamp: c.timestamp,
          }))}
        />
      </Box>

      {/* Footer hints */}
      <Box marginTop={1}>
        <Text color={colors.dim}>
          [{'\u2190'}/{'\u2192'}] Navigate days    [E] Edit notes    [Tab] Switch view
        </Text>
      </Box>
    </Box>
  );
}
