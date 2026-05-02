import { describe, it, expect } from 'vitest';
import {
  generateConsolidatedDigest,
  buildOllamaPromptPerRepo,
  capPerRepoCommits,
  type ConsolidatedDigestInput,
} from '../../src/utils/digest-generator.js';

function makeInput(overrides: Partial<ConsolidatedDigestInput> = {}): ConsolidatedDigestInput {
  return {
    range_label: 'Tuesday, May 1, 2026',
    totals: {
      commits_count: 10,
      lines_added: 500,
      lines_removed: 100,
      files_touched: 25,
      repo_count: 2,
    },
    per_repo: [
      {
        repo_name: 'repo-a',
        commits: [
          { message: 'feat: cross-repo aggregates' },
          { message: 'fix: streak counter race' },
        ],
        summary: { commits_count: 2, lines_added: 200, lines_removed: 50, files_touched: 10 },
      },
      {
        repo_name: 'repo-b',
        commits: [
          { message: 'refactor: loader extraction' },
        ],
        summary: { commits_count: 1, lines_added: 300, lines_removed: 50, files_touched: 15 },
      },
    ],
    modules: [
      { repo_name: 'repo-a', module: 'src/db', percentage: 38 },
      { repo_name: 'repo-b', module: 'src/api', percentage: 24 },
    ],
    ...overrides,
  };
}

describe('generateConsolidatedDigest', () => {
  it('renders a header with totals and active repos', () => {
    const out = generateConsolidatedDigest(makeInput());
    expect(out).toContain('## Tuesday, May 1, 2026 — All Repositories');
    expect(out).toContain('Across 2 repos');
    expect(out).toContain('10 commits');
    expect(out).toContain('+500');
    expect(out).toContain('-100');
    expect(out).toContain('Active in: repo-a, repo-b');
  });

  it('uses singular when there is one repo', () => {
    const out = generateConsolidatedDigest(makeInput({
      totals: { commits_count: 3, lines_added: 100, lines_removed: 20, files_touched: 5, repo_count: 1 },
      per_repo: [
        {
          repo_name: 'solo',
          commits: [{ message: 'feat: solo work' }],
          summary: { commits_count: 3, lines_added: 100, lines_removed: 20, files_touched: 5 },
        },
      ],
    }));
    expect(out).toContain('Across 1 repo');
    expect(out).not.toContain('Across 1 repos');
    // Singular pluralization in the totals line too
    expect(out).toMatch(/3 commits/); // 3 is plural so still 'commits'
  });

  it('uses singular commit/file in totals when count is exactly 1', () => {
    const out = generateConsolidatedDigest(makeInput({
      totals: { commits_count: 1, lines_added: 10, lines_removed: 0, files_touched: 1, repo_count: 1 },
      per_repo: [
        {
          repo_name: 'r',
          commits: [{ message: 'feat: thing' }],
          summary: { commits_count: 1, lines_added: 10, lines_removed: 0, files_touched: 1 },
        },
      ],
    }));
    expect(out).toMatch(/1 commit,/);
    expect(out).not.toMatch(/1 commits/);
    expect(out).toMatch(/1 file\n/);
    expect(out).not.toMatch(/1 files/);
  });

  it('renders a per-repo section with commit count and line stats', () => {
    const out = generateConsolidatedDigest(makeInput());
    expect(out).toMatch(/### repo-a\s+\(2 commits, \+200 \/ -50\)/);
    expect(out).toMatch(/### repo-b\s+\(1 commit, \+300 \/ -50\)/);
  });

  it('paraphrases conventional-commit prefixes into action verbs per repo', () => {
    const out = generateConsolidatedDigest(makeInput());
    expect(out).toContain('Added cross-repo aggregates');
    expect(out).toContain('Fixed streak counter race');
    expect(out).toContain('Refactored loader extraction');
  });

  it('skips duplicate paraphrased messages within one repo', () => {
    const out = generateConsolidatedDigest(makeInput({
      per_repo: [
        {
          repo_name: 'r',
          commits: [
            { message: 'feat: widget' },
            { message: 'feat: widget' },
          ],
          summary: { commits_count: 2, lines_added: 0, lines_removed: 0, files_touched: 0 },
        },
      ],
    }));
    const occurrences = (out.match(/Added widget/g) ?? []).length;
    expect(occurrences).toBe(1);
  });

  it('shows truncation footer when commits were capped', () => {
    const out = generateConsolidatedDigest(makeInput({
      per_repo: [
        {
          repo_name: 'big',
          commits: Array.from({ length: 50 }, (_, i) => ({ message: `feat: thing ${i}` })),
          summary: { commits_count: 50, lines_added: 1, lines_removed: 1, files_touched: 1 },
          truncated_from: 412,
        },
      ],
    }));
    expect(out).toContain('showing 50 most recent');
    expect(out).toContain('362 more in this period');
  });

  it('renders the Top areas line with repo:module labels', () => {
    const out = generateConsolidatedDigest(makeInput());
    expect(out).toContain('### Top areas');
    expect(out).toContain('repo-a:src/db (38%)');
    expect(out).toContain('repo-b:src/api (24%)');
  });

  it('omits Top areas when modules is empty', () => {
    const out = generateConsolidatedDigest(makeInput({ modules: [] }));
    expect(out).not.toContain('Top areas');
  });

  it('renders the AI Assist block with totals and per-repo cost line', () => {
    const out = generateConsolidatedDigest(makeInput({
      ai: {
        total_sessions: 12,
        total_cost: 4.21,
        total_tokens: 1_400_000,
        tools: ['claude-code', 'codex'],
        models: ['claude-opus'],
        providers: ['anthropic'],
        per_repo: [
          { repo_name: 'repo-a', sessions: 8, cost: 2.5, tokens: 900_000 },
          { repo_name: 'repo-b', sessions: 4, cost: 1.71, tokens: 500_000 },
        ],
      },
    }));
    expect(out).toContain('### AI Assist');
    expect(out).toContain('12 sessions');
    expect(out).toContain('$4.21');
    expect(out).toContain('Tools: claude-code, codex');
    expect(out).toContain('Per repo: repo-a $2.50 · repo-b $1.71');
  });

  it('omits AI Assist when no sessions', () => {
    const out = generateConsolidatedDigest(makeInput());
    expect(out).not.toContain('AI Assist');
  });

  it('uses LLM-generated draft for a repo when provided', () => {
    const drafts = new Map<string, string>([
      ['repo-a', '- Built the new aggregates module\n- Wired up tests'],
    ]);
    const out = generateConsolidatedDigest(makeInput({ per_repo_drafts: drafts }));
    expect(out).toContain('Built the new aggregates module');
    expect(out).toContain('Wired up tests');
    // Falls back to template for repo-b
    expect(out).toContain('Refactored loader extraction');
  });
});

describe('capPerRepoCommits', () => {
  it('returns commits unchanged when under the cap', () => {
    const arr = [{ x: 1 }, { x: 2 }];
    const result = capPerRepoCommits(arr, 50);
    expect(result.commits).toBe(arr);
    expect(result.truncated_from).toBeUndefined();
  });

  it('caps commits and reports the original count', () => {
    const arr = Array.from({ length: 60 }, (_, i) => ({ x: i }));
    const result = capPerRepoCommits(arr, 50);
    expect(result.commits).toHaveLength(50);
    expect(result.truncated_from).toBe(60);
  });

  it('uses default cap of 50', () => {
    const arr = Array.from({ length: 100 }, (_, i) => ({ x: i }));
    const result = capPerRepoCommits(arr);
    expect(result.commits).toHaveLength(50);
    expect(result.truncated_from).toBe(100);
  });
});

describe('buildOllamaPromptPerRepo', () => {
  it('includes the repo name and commit messages', () => {
    const prompt = buildOllamaPromptPerRepo(
      'repo-a',
      [{ message: 'feat: new thing' }, { message: 'fix: bug' }],
      { commits_count: 2, lines_added: 100, lines_removed: 30, files_touched: 5 },
    );
    expect(prompt).toContain('**repo-a**');
    expect(prompt).toContain('Repo: repo-a');
    expect(prompt).toContain('feat: new thing');
    expect(prompt).toContain('fix: bug');
    expect(prompt).toContain('Stats: 2 commits, +100/-30 lines, 5 files');
  });

  it('handles null commit messages', () => {
    const prompt = buildOllamaPromptPerRepo(
      'r',
      [{ message: null }],
      { commits_count: 1, lines_added: 0, lines_removed: 0, files_touched: 0 },
    );
    expect(prompt).toContain('(no message)');
  });
});
