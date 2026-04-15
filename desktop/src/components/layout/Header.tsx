import { useState, useRef, useEffect } from "react";
import type { Repo, StreakInfo, View } from "../../lib/types";

interface HeaderProps {
  repo: Repo;
  repos: Repo[];
  streak: StreakInfo;
  cloudConnected: boolean;
  onSwitchRepo: (repo: Repo) => void;
  view: View;
}

const viewTitles: Record<View, string> = {
  overview: "Dashboard",
  "daily-log": "Daily Log",
  history: "History",
  digest: "Digest Editor",
  ai: "AI Sessions",
  cloud: "Cloud",
  repos: "Repositories",
  settings: "Settings",
};

export function Header({ repo, repos, streak, cloudConnected, onSwitchRepo, view }: HeaderProps) {
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRepoDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-surface/80 backdrop-blur-sm flex-shrink-0 relative z-30">
      {/* Left: view title + repo name */}
      <div className="flex items-center gap-4">
        <h1 className="text-text-primary font-semibold text-sm">
          {viewTitles[view]}
        </h1>
        <span className="text-text-dim">|</span>
        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm"
            onClick={() => repos.length > 1 && setShowRepoDropdown(!showRepoDropdown)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span className="font-mono">{repo.name}</span>
            {repos.length > 1 && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            )}
          </button>

          {showRepoDropdown && repos.length > 1 && (
            <div className="absolute top-full left-0 mt-2 rounded-lg py-1 min-w-[240px] z-50 shadow-2xl shadow-black/70 bg-[#1a1a24] border border-white/10">
              {repos.map((r) => (
                <button
                  key={r.id}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    r.id === repo.id
                      ? "text-brand bg-brand/15"
                      : "text-text-secondary hover:text-text-primary hover:bg-white/8"
                  }`}
                  onClick={() => {
                    onSwitchRepo(r);
                    setShowRepoDropdown(false);
                  }}
                >
                  <span className="font-mono">{r.name}</span>
                  <span className="text-text-dim text-xs ml-2 truncate">{r.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: streak + cloud status */}
      <div className="flex items-center gap-6">
        {/* Streak badge */}
        <div className="flex items-center gap-2">
          <span className="text-streak animate-pulse-glow">&#128293;</span>
          <span className="text-streak font-bold text-sm">{streak.current}</span>
          <span className="text-text-dim text-xs">
            day{streak.current !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Cloud status */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              cloudConnected ? "bg-positive" : "bg-text-dim"
            }`}
          />
          <span className="text-text-dim text-xs">
            {cloudConnected ? "Cloud" : "Offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
