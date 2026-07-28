import { formatNumber } from './formatting.js';

export interface AiSessionDigestData {
  total_sessions: number;
  total_cost: number;
  total_tokens: number;
  tools: string[];
  models: string[];
  providers: string[];
}

export function generateTemplateDigest(
  date: Date,
  commits: Array<{ message: string | null }>,
  summary: { commits_count: number; lines_added: number; lines_removed: number; files_touched: number },
  modules: Array<{ module: string; percentage: number }>,
  aiData?: AiSessionDigestData,
): string {
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let md = `## ${dateStr}\n\n`;

  // What I built
  md += '### What I built\n';
  const uniqueMessages = new Set<string>();
  for (const commit of commits) {
    if (commit.message) {
      // Clean up commit message: strip conventional commit prefixes for readability
      let msg = commit.message;
      const prefixMatch = msg.match(/^(?:feat|fix|refactor|chore|docs|test|style|perf|ci|build|revert)(?:\(.+?\))?:\s*/i);
      if (prefixMatch) {
        const prefix = prefixMatch[0].toLowerCase();
        msg = msg.slice(prefixMatch[0].length);

        if (prefix.startsWith('feat')) {
          msg = 'Added ' + msg.charAt(0).toLowerCase() + msg.slice(1);
        } else if (prefix.startsWith('fix')) {
          msg = 'Fixed ' + msg.charAt(0).toLowerCase() + msg.slice(1);
        } else if (prefix.startsWith('refactor')) {
          msg = 'Refactored ' + msg.charAt(0).toLowerCase() + msg.slice(1);
        } else {
          msg = msg.charAt(0).toUpperCase() + msg.slice(1);
        }
      } else {
        msg = msg.charAt(0).toUpperCase() + msg.slice(1);
      }

      if (!uniqueMessages.has(msg)) {
        uniqueMessages.add(msg);
        md += `- ${msg}\n`;
      }
    }
  }

  md += '\n';

  // Stats
  md += '### Stats\n';
  md += `- ${summary.commits_count} commits, +${formatNumber(summary.lines_added)} / -${formatNumber(summary.lines_removed)} lines, ${summary.files_touched} files touched\n`;
  md += '\n';

  // Areas
  if (modules.length > 0) {
    md += '### Areas\n';
    const topModules = modules.slice(0, 5);
    const parts = topModules.map((m) => `${m.module} (${Math.round(m.percentage)}%)`);
    md += `- ${parts.join(', ')}\n`;
  }

  if (aiData && aiData.total_sessions > 0) {
    md += '\n### AI Assist\n';
    const aiParts: string[] = [];
    aiParts.push(`${aiData.total_sessions} session${aiData.total_sessions !== 1 ? 's' : ''}`);
    if (aiData.total_tokens > 0) aiParts.push(`${formatNumber(aiData.total_tokens)} tokens`);
    if (aiData.total_cost > 0) aiParts.push(`$${aiData.total_cost.toFixed(4)}`);
    md += `- ${aiParts.join(', ')}\n`;
    if (aiData.tools.length > 0) md += `- Tools: ${aiData.tools.join(', ')}\n`;
    if (aiData.models.length > 0) md += `- Models: ${aiData.models.join(', ')}\n`;
  }

  return md;
}

export async function generateWithOllama(prompt: string, model: string, url: string): Promise<string> {
  const response = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!response.ok) throw new Error('Ollama request failed');
  const data = await response.json() as { response: string };
  return data.response;
}

export function buildOllamaPrompt(
  commits: Array<{ message: string | null }>,
  summary: { commits_count: number; lines_added: number; lines_removed: number; files_touched: number },
  modules: Array<{ module: string; percentage: number }>,
): string {
  const commitList = commits.map((c) => `- ${c.message || '(no message)'}`).join('\n');
  const moduleList = modules.slice(0, 5).map((m) => `${m.module} (${Math.round(m.percentage)}%)`).join(', ');

  return `You are writing a daily developer work summary. Be concise, factual, and focus on what was actually accomplished.

Here are today's git commits:
${commitList}

Stats: ${summary.commits_count} commits, +${summary.lines_added}/-${summary.lines_removed} lines, ${summary.files_touched} files
Active areas: ${moduleList || 'various'}

Write a brief markdown summary with:
1. "What I built" section (bullet points of accomplishments, not raw commit messages)
2. Key stats
3. Areas of focus

Keep it under 200 words. No fluff.`;
}

export interface ConsolidatedRepoSection {
  repo_name: string;
  commits: Array<{ message: string | null; sha?: string; timestamp?: string }>;
  summary: { commits_count: number; lines_added: number; lines_removed: number; files_touched: number };
  truncated_from?: number;
}

export interface ConsolidatedTotals {
  commits_count: number;
  lines_added: number;
  lines_removed: number;
  files_touched: number;
  repo_count: number;
}

export interface ConsolidatedDigestInput {
  range_label: string;
  totals: ConsolidatedTotals;
  per_repo: ConsolidatedRepoSection[];
  modules: Array<{ repo_name: string; module: string; percentage: number }>;
  ai?: AiSessionDigestData & { per_repo?: Array<{ repo_name: string; sessions: number; cost: number; tokens: number }> };
  per_repo_drafts?: Map<string, string>;
}

const PER_REPO_COMMIT_CAP = 50;

function formatRepoCommitBullets(commits: Array<{ message: string | null }>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of commits) {
    if (!c.message) continue;
    let msg = c.message;
    const prefixMatch = msg.match(/^(?:feat|fix|refactor|chore|docs|test|style|perf|ci|build|revert)(?:\(.+?\))?:\s*/i);
    if (prefixMatch) {
      const prefix = prefixMatch[0].toLowerCase();
      msg = msg.slice(prefixMatch[0].length);
      if (prefix.startsWith('feat')) {
        msg = 'Added ' + msg.charAt(0).toLowerCase() + msg.slice(1);
      } else if (prefix.startsWith('fix')) {
        msg = 'Fixed ' + msg.charAt(0).toLowerCase() + msg.slice(1);
      } else if (prefix.startsWith('refactor')) {
        msg = 'Refactored ' + msg.charAt(0).toLowerCase() + msg.slice(1);
      } else {
        msg = msg.charAt(0).toUpperCase() + msg.slice(1);
      }
    } else {
      msg = msg.charAt(0).toUpperCase() + msg.slice(1);
    }
    if (!seen.has(msg)) {
      seen.add(msg);
      out.push(msg);
    }
  }
  return out;
}

export function capPerRepoCommits<T>(
  commits: T[],
  cap: number = PER_REPO_COMMIT_CAP,
): { commits: T[]; truncated_from?: number } {
  if (commits.length <= cap) return { commits };
  return { commits: commits.slice(0, cap), truncated_from: commits.length };
}

export function generateConsolidatedDigest(input: ConsolidatedDigestInput): string {
  const { range_label, totals, per_repo, modules, ai, per_repo_drafts } = input;

  let md = `## ${range_label} — All Repositories\n\n`;
  md += `### Across ${totals.repo_count} repo${totals.repo_count !== 1 ? 's' : ''}\n`;
  md += `- ${formatNumber(totals.commits_count)} commit${totals.commits_count !== 1 ? 's' : ''}, +${formatNumber(totals.lines_added)} / -${formatNumber(totals.lines_removed)} lines, ${formatNumber(totals.files_touched)} file${totals.files_touched !== 1 ? 's' : ''}\n`;
  if (per_repo.length > 0) {
    md += `- Active in: ${per_repo.map((r) => r.repo_name).join(', ')}\n`;
  }
  md += '\n';

  for (const section of per_repo) {
    const s = section.summary;
    md += `### ${section.repo_name}  (${s.commits_count} commit${s.commits_count !== 1 ? 's' : ''}, +${formatNumber(s.lines_added)} / -${formatNumber(s.lines_removed)})\n`;

    const draft = per_repo_drafts?.get(section.repo_name);
    if (draft) {
      md += draft.trim() + '\n';
    } else {
      const bullets = formatRepoCommitBullets(section.commits);
      for (const b of bullets) {
        md += `- ${b}\n`;
      }
    }
    if (section.truncated_from && section.truncated_from > section.commits.length) {
      const more = section.truncated_from - section.commits.length;
      md += `- _(showing ${section.commits.length} most recent — ${more} more in this period)_\n`;
    }
    md += '\n';
  }

  if (modules.length > 0) {
    md += '### Top areas\n';
    const top = modules.slice(0, 8);
    md += top.map((m) => `${m.repo_name}:${m.module} (${Math.round(m.percentage)}%)`).join(' · ') + '\n\n';
  }

  if (ai && ai.total_sessions > 0) {
    md += '### AI Assist\n';
    const aiParts: string[] = [];
    aiParts.push(`${ai.total_sessions} session${ai.total_sessions !== 1 ? 's' : ''}`);
    if (ai.total_tokens > 0) aiParts.push(`${formatNumber(ai.total_tokens)} tokens`);
    if (ai.total_cost > 0) aiParts.push(`$${ai.total_cost.toFixed(2)}`);
    md += `- ${aiParts.join(' · ')}\n`;
    if (ai.tools.length > 0) md += `- Tools: ${ai.tools.join(', ')}\n`;
    if (ai.per_repo && ai.per_repo.length > 0) {
      const perRepoLine = ai.per_repo
        .map((r) => `${r.repo_name} $${r.cost.toFixed(2)}`)
        .join(' · ');
      md += `- Per repo: ${perRepoLine}\n`;
    }
  }

  return md;
}

export function buildOllamaPromptPerRepo(
  repoName: string,
  commits: Array<{ message: string | null }>,
  summary: { commits_count: number; lines_added: number; lines_removed: number; files_touched: number },
): string {
  const commitList = commits.map((c) => `- ${c.message || '(no message)'}`).join('\n');
  return `You are writing a developer work summary for one repository within a multi-repo digest.
Be concise, factual, and focus on what was actually accomplished in **${repoName}**.

Repo: ${repoName}
Stats: ${summary.commits_count} commits, +${summary.lines_added}/-${summary.lines_removed} lines, ${summary.files_touched} files

Commits:
${commitList}

Write 3-6 short bullet points (no header) describing what was built or changed.
Use action verbs. No fluff. No raw commit messages — paraphrase into plain English.`;
}
