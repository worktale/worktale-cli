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
