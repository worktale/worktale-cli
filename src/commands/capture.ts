import { captureLatestCommit } from '../git/capture.js';
import { closeDb } from '../db/index.js';

export async function captureCommand(options: { silent?: boolean } = {}): Promise<void> {
  try {
    const repoPath = process.cwd();
    const silent = options.silent ?? false;

    await captureLatestCommit(repoPath, silent);

    closeDb();
    process.exit(0);
  } catch {
    // The capture command must NEVER fail or produce error output
    // It runs from git hooks and must be invisible
    closeDb();
    process.exit(0);
  }
}
