import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface AnalysisProgress {
  total: number;
  processed: number;
  phase: 'scanning' | 'analyzing' | 'storing';
}

export interface AnalysisResult {
  totalCommits: number;
  firstCommitDate: string;
  linesAdded: number;
  linesRemoved: number;
  filesTracked: number;
  branchCount: number;
  authorCount: number;
  daysActive: number;
}

export function runAnalysis(
  repoPath: string,
  repoId: number,
  userEmail: string,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    // Worker is always at dist/workers/analysis-worker.js relative to the dist root
    // import.meta.url might resolve to a chunk in dist/, so we go up and into workers/
    const distDir = dirname(fileURLToPath(import.meta.url));
    const workerPath = join(distDir, 'workers', 'analysis-worker.js');
    const worker = new Worker(workerPath);

    worker.on('message', (msg: { type: string; total?: number; processed?: number; phase?: string; stats?: AnalysisResult; message?: string }) => {
      if (msg.type === 'progress') {
        onProgress({
          total: msg.total!,
          processed: msg.processed!,
          phase: msg.phase as AnalysisProgress['phase'],
        });
      } else if (msg.type === 'complete') {
        resolve(msg.stats!);
        worker.terminate();
      } else if (msg.type === 'error') {
        reject(new Error(msg.message ?? 'Unknown worker error'));
        worker.terminate();
      }
    });

    worker.on('error', (err) => reject(err));
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });

    worker.postMessage({ repoPath, repoId, userEmail });
  });
}
