import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { getRepo } from '../db/repos.js';
import { getCommitsByDate } from '../db/commits.js';
import { getDailySummary } from '../db/daily-summaries.js';
import { getModuleActivityByDate } from '../db/file-activity.js';
import { closeDb } from '../db/index.js';
import { getDateString } from '../utils/formatting.js';
import { brandText, dimText, positiveText, streakText, secondaryText } from '../tui/theme.js';
import { isCloudConfigured, cloudFetch } from '../utils/cloud-client.js';
import { showCatchupBanner } from '../utils/catchup-banner.js';
import { markPublished } from '../db/daily-summaries.js';
import { getAiSessionsByDate } from '../db/ai-sessions.js';

export async function publishCommand(options: { week?: boolean } = {}): Promise<void> {
  try {
    if (!isCloudConfigured()) {
      showUpsell();
      closeDb();
      process.exit(0);
      return;
    }

    if (options.week) {
      await publishWeekly();
    } else {
      await publishDaily();
    }

    closeDb();
    process.exit(0);
  } catch (err: unknown) {
    console.error(chalk.red('  Error:'), err instanceof Error ? err.message : String(err));
    closeDb();
    process.exit(1);
  }
}

async function publishDaily(): Promise<void> {
  const repoPath = process.cwd();

  const repo = getRepo(repoPath);
  if (!repo) {
    console.log('');
    console.log('  ' + dimText('worktale:') + ' not a tracked repo.');
    console.log('  Run ' + brandText('worktale init') + ' to get started.');
    console.log('');
    return;
  }

  const today = getDateString();
  const commits = getCommitsByDate(repo.id, today);
  const summary = getDailySummary(repo.id, today);

  if (commits.length === 0 && !summary) {
    console.log('');
    console.log('  ' + dimText('No activity today. Nothing to publish.'));
    console.log('');
    return;
  }

  console.log('');
  console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('Publishing to Worktale Cloud...'));

  const modules = getModuleActivityByDate(repo.id, today);
  const commitMessages = commits.map((c) => c.message).filter(Boolean);
  const moduleActivity: Record<string, number> = {};
  for (const m of modules) {
    moduleActivity[m.module] = m.percentage / 100;
  }

  // Gather AI session data
  const aiSessions = getAiSessionsByDate(repo.id, today);
  const aiSessionData = aiSessions.length > 0 ? {
    sessions: aiSessions.length,
    cost: aiSessions.reduce((s, a) => s + a.cost_usd, 0),
    tokens: aiSessions.reduce((s, a) => s + a.input_tokens + a.output_tokens, 0),
    tools: [...new Set(aiSessions.map((a) => a.tool).filter(Boolean))],
    models: [...new Set(aiSessions.map((a) => a.model).filter(Boolean))],
    providers: [...new Set(aiSessions.map((a) => a.provider).filter(Boolean))],
  } : null;

  const syncData = {
    repoName: repo.name,
    repoSlug: basename(repoPath).toLowerCase().replace(/\s+/g, '-'),
    date: today,
    commitsCount: summary?.commits_count ?? commits.length,
    linesAdded: summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0),
    linesRemoved: summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0),
    filesChanged: summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0),
    commitMessages: JSON.stringify(commitMessages),
    moduleActivity: JSON.stringify(moduleActivity),
    userNotes: summary?.user_notes ?? null,
    aiDraft: summary?.ai_draft ?? null,
    aiSessions: aiSessionData ? JSON.stringify(aiSessionData) : null,
  };

  const result = await cloudFetch<{ id: string }>('/api/v1/digests', {
    method: 'POST',
    body: syncData,
  });

  // Mark digest as published in the cloud so it appears on public profile
  if (result.data?.id) {
    await cloudFetch(`/api/v1/digests/${result.data.id}`, {
      method: 'PATCH',
      body: { isPublished: true },
    });
  }

  // Fetch profile to get username for the published URL
  let profileUrl = 'worktale.dev';
  try {
    const profile = await cloudFetch<{ username: string }>('/api/v1/profile');
    if (profile.data?.username) {
      profileUrl = `worktale.dev/${profile.data.username}`;
    }
  } catch {}

  markPublished(repo.id, today);

  console.log('  ' + positiveText('\u2713') + '  Published to ' + brandText(profileUrl));
  console.log('');
  console.log('  ' + dimText('Commits:') + '     ' + syncData.commitsCount);
  console.log('  ' + dimText('Lines:') + '       ' + positiveText('+' + syncData.linesAdded) + ' / ' + chalk.red('-' + syncData.linesRemoved));
  console.log('');
  showCatchupBanner();
  console.log('  ' + secondaryText('Run') + ' ' + brandText('worktale publish --week') + ' ' + secondaryText('to generate a weekly digest.'));
  console.log('');
}

async function publishWeekly(): Promise<void> {
  console.log('');
  console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('Generating weekly digest...'));

  const result = await cloudFetch<{
    aiSummary: string;
    weekStartDate: string;
    weekEndDate: string;
  }>('/api/v1/weekly', {
    method: 'POST',
    body: {},
  });

  if (result.data) {
    console.log('');
    console.log('  ' + chalk.bold(`Week of ${result.data.weekStartDate} — ${result.data.weekEndDate}`));
    console.log('  ' + dimText('\u2500'.repeat(50)));
    console.log('');

    const lines = (result.data.aiSummary ?? '').split('\n');
    for (const line of lines) {
      console.log('  ' + line);
    }

    console.log('');
    console.log('  ' + positiveText('\u2713') + '  Weekly digest generated!');
    console.log('  ' + dimText('Edit and publish at') + ' ' + brandText('worktale.dev'));
    console.log('');
  }
}

function showUpsell(): void {
  console.log('');
  console.log('  ' + streakText('\u26A1') + ' ' + chalk.bold('WORKTALE CLOUD'));
  console.log('');
  console.log('  ' + secondaryText('\u2022') + ' ' + chalk.bold('Your developer portfolio') + ' \u2014 ' + brandText('worktale.dev/{you}'));
  console.log('  ' + secondaryText('\u2022') + ' ' + chalk.bold('Unified cross-repo timeline'));
  console.log('  ' + secondaryText('\u2022') + ' ' + chalk.bold('AI weekly digests'));
  console.log('  ' + secondaryText('\u2022') + ' ' + chalk.bold('Instant standups & retros'));
  console.log('  ' + secondaryText('\u2022') + ' ' + chalk.bold('Weekly email summaries'));
  console.log('');
  console.log('  Get started: ' + brandText('worktale cloud signup'));
  console.log('');
}
