import { useState } from "react";
import { motion } from "framer-motion";
import * as api from "../../lib/api";
import { formatDateShort } from "../../lib/utils";
import type { Repo } from "../../lib/types";

interface RepoManagerProps {
  repos: Repo[];
  activeRepo: Repo;
  onSwitch: (repo: Repo) => void;
  onRefresh: () => void;
}

export function RepoManager({ repos, activeRepo, onSwitch, onRefresh }: RepoManagerProps) {
  const [removing, setRemoving] = useState<number | null>(null);
  const [commitCounts, setCommitCounts] = useState<Record<number, number>>({});

  // Load commit counts on mount
  useState(() => {
    async function loadCounts() {
      const counts: Record<number, number> = {};
      for (const repo of repos) {
        try {
          counts[repo.id] = await api.getCommitCount(repo.id);
        } catch {
          counts[repo.id] = 0;
        }
      }
      setCommitCounts(counts);
    }
    loadCounts();
  });

  async function handleRemove(repoId: number) {
    if (removing === repoId) {
      // Confirm removal
      try {
        await api.removeRepo(repoId);
        onRefresh();
      } catch (e) {
        console.error("Failed to remove repo:", e);
      }
      setRemoving(null);
    } else {
      setRemoving(repoId);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Tracked Repositories</h2>
        <span className="text-text-dim text-sm">{repos.length} repo{repos.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-2">
        {repos.map((repo, i) => {
          const isActive = repo.id === activeRepo.id;
          const isRemoving = removing === repo.id;
          const count = commitCounts[repo.id] ?? 0;

          return (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`glass p-4 flex items-center gap-4 transition-all cursor-pointer ${
                isActive ? "border-brand/30 glow-green" : "glass-hover"
              }`}
              onClick={() => onSwitch(repo)}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isActive ? "bg-brand/20" : "bg-surface-2"
              }`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isActive ? "#4ADE80" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-sm font-bold ${isActive ? "text-brand" : "text-text-primary"}`}>
                    {repo.name}
                  </span>
                  {isActive && (
                    <span className="text-[10px] bg-brand/20 text-brand px-1.5 py-0.5 rounded-full">ACTIVE</span>
                  )}
                </div>
                <span className="text-text-dim text-xs truncate block">{repo.path}</span>
              </div>

              {/* Stats */}
              <div className="text-right flex-shrink-0">
                <div className="text-text-primary font-mono text-sm">{count.toLocaleString()} commits</div>
                {repo.last_synced && (
                  <div className="text-text-dim text-xs">Last synced {formatDateShort(repo.last_synced)}</div>
                )}
              </div>

              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(repo.id); }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-all ${
                  isRemoving
                    ? "bg-negative/20 text-negative font-bold"
                    : "bg-surface-2 text-text-dim hover:text-negative hover:bg-negative/10"
                }`}
              >
                {isRemoving ? "Confirm?" : "Remove"}
              </button>
            </motion.div>
          );
        })}
      </div>

      {repos.length === 0 && (
        <div className="glass p-8 text-center">
          <p className="text-text-dim text-sm mb-2">No repositories tracked yet.</p>
          <p className="text-text-dim text-xs">
            Run <code className="text-brand font-mono">worktale init</code> in a git repository.
          </p>
        </div>
      )}

      <div className="text-text-dim text-xs">
        To add a new repository, run <code className="text-brand font-mono">worktale init</code> in the target directory.
      </div>
    </div>
  );
}
