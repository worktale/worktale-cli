import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  mkdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

const HOOK_START_MARKER = '# --- Worktale hook start ---';
const HOOK_END_MARKER = '# --- Worktale hook end ---';
const WORKTALE_IDENTIFIER = 'worktale';

const POST_COMMIT_BASH = `#!/bin/sh
# Worktale post-commit hook
if [ -n "$PSVersionTable" ] || [ "$OS" = "Windows_NT" ]; then
  powershell.exe -ExecutionPolicy Bypass -File "$(git rev-parse --git-dir)/hooks/post-commit.ps1" 2>/dev/null
else
  worktale capture --silent 2>/dev/null || true
fi
`;

const POST_COMMIT_PS1 = `# Worktale post-commit hook (Windows)
$worktale = (Get-Command worktale -ErrorAction SilentlyContinue)
if ($worktale) {
  & worktale capture --silent
}
`;

const WORKTALE_BASH_SECTION = `
${HOOK_START_MARKER}
worktale capture --silent 2>/dev/null || true
${HOOK_END_MARKER}
`;

const POST_PUSH_BASH = `#!/bin/sh
# Worktale post-push reminder
${HOOK_START_MARKER}
echo "  Tip: run 'worktale digest' to review today's work" 2>/dev/null || true
${HOOK_END_MARKER}
`;

function getHooksDir(repoPath: string): string {
  return join(repoPath, '.git', 'hooks');
}

function ensureHooksDir(repoPath: string): void {
  const hooksDir = getHooksDir(repoPath);
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }
}

function hookContainsWorktale(content: string): boolean {
  return content.includes(WORKTALE_IDENTIFIER);
}

export function installPostCommitHook(repoPath: string): void {
  ensureHooksDir(repoPath);
  const hooksDir = getHooksDir(repoPath);
  const bashHookPath = join(hooksDir, 'post-commit');
  const ps1HookPath = join(hooksDir, 'post-commit.ps1');

  // Handle bash hook
  if (existsSync(bashHookPath)) {
    const existing = readFileSync(bashHookPath, 'utf-8');
    if (!hookContainsWorktale(existing)) {
      // Append worktale section to existing hook
      const appended = existing.trimEnd() + '\n' + WORKTALE_BASH_SECTION;
      writeFileSync(bashHookPath, appended, 'utf-8');
    }
    // If it already contains worktale, do nothing
  } else {
    // Write fresh hook
    writeFileSync(bashHookPath, POST_COMMIT_BASH, 'utf-8');
  }

  // Make bash hook executable (no-op on Windows, but harmless)
  try {
    chmodSync(bashHookPath, 0o755);
  } catch {
    // chmod may fail on Windows — that's fine
  }

  // Write PowerShell hook (always overwrite — it's ours entirely)
  writeFileSync(ps1HookPath, POST_COMMIT_PS1, 'utf-8');
}

export function installPostPushHook(repoPath: string): void {
  ensureHooksDir(repoPath);
  const hooksDir = getHooksDir(repoPath);
  const hookPath = join(hooksDir, 'post-push');

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, 'utf-8');
    if (!hookContainsWorktale(existing)) {
      const section = `
${HOOK_START_MARKER}
echo "  Tip: run 'worktale digest' to review today's work" 2>/dev/null || true
${HOOK_END_MARKER}
`;
      const appended = existing.trimEnd() + '\n' + section;
      writeFileSync(hookPath, appended, 'utf-8');
    }
  } else {
    writeFileSync(hookPath, POST_PUSH_BASH, 'utf-8');
  }

  try {
    chmodSync(hookPath, 0o755);
  } catch {
    // chmod may fail on Windows
  }
}

export function isHookInstalled(repoPath: string, hookName: string): boolean {
  const hookPath = join(getHooksDir(repoPath), hookName);
  if (!existsSync(hookPath)) return false;

  try {
    const content = readFileSync(hookPath, 'utf-8');
    return hookContainsWorktale(content);
  } catch {
    return false;
  }
}

export function removeHooks(repoPath: string): void {
  const hooksDir = getHooksDir(repoPath);
  const hookNames = ['post-commit', 'post-push'];

  for (const hookName of hookNames) {
    const hookPath = join(hooksDir, hookName);
    if (!existsSync(hookPath)) continue;

    try {
      const content = readFileSync(hookPath, 'utf-8');
      if (!hookContainsWorktale(content)) continue;

      // Remove the worktale marked section
      const cleaned = removeWorktaleSection(content);

      if (isEmptyHook(cleaned)) {
        // If only worktale content was there, remove the file entirely
        unlinkSync(hookPath);
      } else {
        writeFileSync(hookPath, cleaned, 'utf-8');
      }
    } catch {
      // Silently continue — never break the user's workflow
    }
  }

  // Also remove the PowerShell hook (it's entirely ours)
  const ps1Path = join(hooksDir, 'post-commit.ps1');
  if (existsSync(ps1Path)) {
    try {
      unlinkSync(ps1Path);
    } catch {
      // Ignore
    }
  }
}

function removeWorktaleSection(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.trim() === HOOK_START_MARKER) {
      inSection = true;
      continue;
    }
    if (line.trim() === HOOK_END_MARKER) {
      inSection = false;
      continue;
    }
    if (!inSection) {
      result.push(line);
    }
  }

  // Also remove standalone worktale lines that aren't in a marked section
  // (for hooks we wrote entirely, like the initial post-commit)
  const filtered = result.filter((line) => {
    const trimmed = line.trim();
    // Keep shebang and empty lines
    if (trimmed === '' || trimmed.startsWith('#!')) return true;
    // Remove lines that are purely worktale comments or commands
    if (trimmed === '# Worktale post-commit hook') return false;
    if (trimmed === '# Worktale post-commit hook (Windows)') return false;
    if (trimmed === '# Worktale post-push reminder') return false;
    if (trimmed.includes('worktale capture')) return false;
    if (
      trimmed.includes('powershell.exe') &&
      trimmed.includes('post-commit.ps1')
    ) {
      return false;
    }
    if (
      trimmed.includes('PSVersionTable') ||
      trimmed.includes('Windows_NT')
    ) {
      // Only remove if it's part of our specific conditional block
      if (trimmed.includes('PSVersionTable') && trimmed.includes('Windows_NT')) {
        return false;
      }
    }
    return true;
  });

  return filtered.join('\n');
}

function isEmptyHook(content: string): boolean {
  const meaningful = content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('#!') && !trimmed.startsWith('#');
    });
  return meaningful.length === 0;
}
