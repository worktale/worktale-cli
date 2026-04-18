import { getCommitsByDate } from '../db/commits.js';
import { getDailySummary, updateUserNotes, upsertDailySummary } from '../db/daily-summaries.js';
import { getModuleActivityByDate } from '../db/file-activity.js';
import { getAiSessionsByDate } from '../db/ai-sessions.js';
import { generateTemplateDigest, type AiSessionDigestData } from './digest-generator.js';

/**
 * Generate and save a template digest for a (repoId, date), without any user
 * interaction. Used by the nudge auto-digest path and anywhere else we want to
 * fill in a draft automatically.
 *
 * Returns the generated digest body, or null if there are no commits to digest.
 * The digest is written to daily_summaries.user_notes — the same column the
 * interactive `worktale digest` command writes to, so downstream readers
 * (TUI Daily Log, publish, nudge "hasDigest" check) see it consistently.
 */
export function generateAndSaveDigest(repoId: number, date: string): string | null {
  const commits = getCommitsByDate(repoId, date);
  if (commits.length === 0) return null;

  const existing = getDailySummary(repoId, date);
  if (!existing) {
    upsertDailySummary({ repo_id: repoId, date });
  }
  const summary = getDailySummary(repoId, date)!;
  const modules = getModuleActivityByDate(repoId, date);

  const sessions = getAiSessionsByDate(repoId, date);
  let aiData: AiSessionDigestData | undefined;
  if (sessions.length > 0) {
    const tools = new Set<string>();
    const models = new Set<string>();
    const providers = new Set<string>();
    let totalCost = 0;
    let totalTokens = 0;
    for (const s of sessions) {
      if (s.tool) tools.add(s.tool);
      if (s.model) models.add(s.model);
      if (s.provider) providers.add(s.provider);
      totalCost += s.cost_usd;
      totalTokens += s.input_tokens + s.output_tokens;
    }
    aiData = {
      total_sessions: sessions.length,
      total_cost: totalCost,
      total_tokens: totalTokens,
      tools: [...tools],
      models: [...models],
      providers: [...providers],
    };
  }

  const body = generateTemplateDigest(
    new Date(date + 'T00:00:00'),
    commits,
    summary,
    modules,
    aiData,
  );

  updateUserNotes(repoId, date, body);
  return body;
}
