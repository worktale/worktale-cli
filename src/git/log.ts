import { simpleGit } from 'simple-git';

export interface GitCommitData {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  timestamp: string; // ISO 8601
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  filePaths: string[];
  branch: string;
  isMerge: boolean;
  tags: string[];
}

interface GetCommitLogOptions {
  since?: string;
  until?: string;
  author?: string;
  maxCount?: number;
}

/**
 * Parse the custom git log format into GitCommitData[].
 *
 * Format per commit (produced by --format=%H%n%s%n%an%n%ae%n%aI%n%P%n%D):
 *   Line 1: SHA
 *   Line 2: Subject
 *   Line 3: Author name
 *   Line 4: Author email
 *   Line 5: ISO date
 *   Line 6: Parent SHAs (space-separated; >1 = merge)
 *   Line 7: Refs (branches, tags)
 *   Then numstat lines: added\tremoved\tpath
 *   Then blank line(s) before next commit
 */
function parseGitLogOutput(raw: string): GitCommitData[] {
  const commits: GitCommitData[] = [];
  if (!raw.trim()) return commits;

  const lines = raw.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Skip blank lines between commits
    while (i < lines.length && lines[i].trim() === '') {
      i++;
    }
    if (i >= lines.length) break;

    // A SHA is 40 hex chars at the start of a line
    const shaLine = lines[i]?.trim();
    if (!shaLine || !/^[0-9a-f]{40}$/i.test(shaLine)) {
      i++;
      continue;
    }

    const sha = shaLine;
    const message = lines[i + 1] ?? '';
    const author = lines[i + 2] ?? '';
    const authorEmail = lines[i + 3] ?? '';
    const timestamp = lines[i + 4] ?? '';
    const parents = (lines[i + 5] ?? '').trim();
    const refs = (lines[i + 6] ?? '').trim();

    i += 7;

    // Parse refs for branch and tags
    let branch = '';
    const tags: string[] = [];
    if (refs) {
      const refParts = refs.split(',').map((r) => r.trim());
      for (const ref of refParts) {
        if (ref.startsWith('tag: ')) {
          tags.push(ref.slice(5).trim());
        } else if (ref.startsWith('HEAD -> ')) {
          branch = ref.slice(8).trim();
        } else if (ref && !ref.includes('HEAD') && ref !== '') {
          // Could be a remote branch or other ref; use first non-tag as branch if none set
          if (!branch) {
            branch = ref;
          }
        }
      }
    }

    // Detect merge: more than 1 parent SHA
    const isMerge = parents.split(/\s+/).filter(Boolean).length > 1;

    // Skip blank lines between header and numstat data
    while (i < lines.length && lines[i].trim() === '') {
      i++;
    }

    // Parse numstat lines
    let linesAdded = 0;
    let linesRemoved = 0;
    const filePaths: string[] = [];

    while (i < lines.length) {
      const line = lines[i];
      // numstat line: added\tremoved\tpath (tab-separated)
      if (line && /^\d+\t\d+\t/.test(line)) {
        const parts = line.split('\t');
        linesAdded += parseInt(parts[0], 10) || 0;
        linesRemoved += parseInt(parts[1], 10) || 0;
        filePaths.push(parts.slice(2).join('\t')); // path may contain tabs (rare)
        i++;
      } else if (line && /^-\t-\t/.test(line)) {
        // Binary file: -\t-\tpath — treat as 0/0
        const parts = line.split('\t');
        filePaths.push(parts.slice(2).join('\t'));
        i++;
      } else {
        break;
      }
    }

    commits.push({
      sha,
      message,
      author,
      authorEmail,
      timestamp,
      linesAdded,
      linesRemoved,
      filesChanged: filePaths.length,
      filePaths,
      branch,
      isMerge,
      tags,
    });
  }

  return commits;
}

export async function getCommitLog(
  repoPath: string,
  options?: GetCommitLogOptions,
): Promise<GitCommitData[]> {
  const git = simpleGit(repoPath);

  const args: string[] = [
    'log',
    '--format=%H%n%s%n%an%n%ae%n%aI%n%P%n%D',
    '--numstat',
  ];

  if (options?.author) args.push(`--author=${options.author}`);
  if (options?.since) args.push(`--since=${options.since}`);
  if (options?.until) args.push(`--until=${options.until}`);
  if (options?.maxCount) args.push('-n', `${options.maxCount}`);

  const result = await git.raw(args);
  return parseGitLogOutput(result);
}

export async function getLatestCommit(
  repoPath: string,
): Promise<GitCommitData | null> {
  const commits = await getCommitLog(repoPath, { maxCount: 1 });
  return commits[0] ?? null;
}

export async function getCommitCount(
  repoPath: string,
  author?: string,
): Promise<number> {
  const git = simpleGit(repoPath);
  const args: string[] = ['rev-list', '--count', 'HEAD'];
  if (author) args.push(`--author=${author}`);

  try {
    const result = await git.raw(args);
    return parseInt(result.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

export async function getFirstCommitDate(
  repoPath: string,
  author?: string,
): Promise<string | null> {
  const git = simpleGit(repoPath);
  const args: string[] = [
    'log',
    '--reverse',
    '--format=%aI',
    '-1',
  ];
  if (author) args.push(`--author=${author}`);

  try {
    const result = await git.raw(args);
    const date = result.trim();
    return date || null;
  } catch {
    return null;
  }
}

export async function getBranches(repoPath: string): Promise<string[]> {
  const git = simpleGit(repoPath);
  const result = await git.branchLocal();
  return result.all;
}

export async function getTags(
  repoPath: string,
): Promise<{ name: string; date: string }[]> {
  const git = simpleGit(repoPath);

  try {
    // Get tags with their dates using for-each-ref
    const result = await git.raw([
      'for-each-ref',
      '--sort=-creatordate',
      '--format=%(refname:short)\t%(creatordate:iso-strict)',
      'refs/tags',
    ]);

    if (!result.trim()) return [];

    return result
      .trim()
      .split('\n')
      .map((line) => {
        const [name, date] = line.split('\t');
        return { name: name ?? '', date: date ?? '' };
      })
      .filter((t) => t.name);
  } catch {
    return [];
  }
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    const result = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
    return result.trim();
  } catch {
    return 'unknown';
  }
}

export async function getCurrentUserEmail(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    const result = await git.raw(['config', 'user.email']);
    return result.trim();
  } catch {
    return '';
  }
}

export async function getFileCount(repoPath: string): Promise<number> {
  const git = simpleGit(repoPath);
  try {
    const result = await git.raw(['ls-files']);
    const lines = result.trim().split('\n').filter(Boolean);
    return lines.length;
  } catch {
    return 0;
  }
}
