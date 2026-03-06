import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';

export async function createTestRepo(): Promise<{ path: string; cleanup: () => void }> {
  const repoPath = mkdtempSync(join(tmpdir(), 'worktale-test-'));
  const git = simpleGit(repoPath);

  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Test User');

  return {
    path: repoPath,
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  };
}

export async function addTestCommit(
  repoPath: string,
  filename: string,
  content: string,
  message: string,
): Promise<string> {
  const git = simpleGit(repoPath);
  writeFileSync(join(repoPath, filename), content);
  await git.add(filename);
  const result = await git.commit(message);
  return result.commit;
}
