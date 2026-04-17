import { useState, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  const [isMaximized, setIsMaximized] = useState(false);
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

  useEffect(() => {
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function handleMinimize() {
    await getCurrentWindow().minimize();
  }

  async function handleToggleMaximize() {
    await getCurrentWindow().toggleMaximize();
  }

  async function handleClose() {
    await getCurrentWindow().close();
  }

  return (
    <header
      data-tauri-drag-region
      className="h-10 flex items-center justify-between pl-4 pr-0 border-b border-border bg-surface/80 backdrop-blur-sm flex-shrink-0 relative z-30 select-none"
    >
      {/* Left: view title + repo name */}
      <div className="flex items-center gap-3" data-tauri-drag-region>
        <h1 className="text-text-primary font-semibold text-xs" data-tauri-drag-region>
          {viewTitles[view]}
        </h1>
        <span className="text-text-dim text-xs" data-tauri-drag-region>&middot;</span>
        <div className="relative" ref={dropdownRef}>
          <button
            className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors text-xs"
            onClick={() => repos.length > 1 && setShowRepoDropdown(!showRepoDropdown)}
          >
            <span className="font-mono">{repo.name}</span>
            {repos.length > 1 && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

      {/* Center: drag region fills space */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Right: streak + cloud + window controls */}
      <div className="flex items-center gap-0 h-full">
        {/* Streak badge */}
        <div className="flex items-center gap-1.5 px-3" data-tauri-drag-region>
          <span className="text-streak animate-pulse-glow text-xs">&#128293;</span>
          <span className="text-streak font-bold text-xs">{streak.current}</span>
        </div>

        {/* Cloud status */}
        <div className="flex items-center gap-1 px-3" data-tauri-drag-region>
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              cloudConnected ? "bg-positive" : "bg-text-dim"
            }`}
          />
          <span className="text-text-dim text-[10px]">
            {cloudConnected ? "Cloud" : "Offline"}
          </span>
        </div>

        {/* Window controls */}
        <button
          onClick={handleMinimize}
          className="h-full w-11 flex items-center justify-center text-text-dim hover:text-text-primary hover:bg-white/8 transition-colors"
          title="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2"/></svg>
        </button>
        <button
          onClick={handleToggleMaximize}
          className="h-full w-11 flex items-center justify-center text-text-dim hover:text-text-primary hover:bg-white/8 transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="0.5" y="2.5" width="7" height="7" rx="0.5"/><path d="M2.5 2.5V1a.5.5 0 0 1 .5-.5H9a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H7.5"/>
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="0.5" y="0.5" width="9" height="9" rx="0.5"/></svg>
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-full w-11 flex items-center justify-center text-text-dim hover:text-white hover:bg-red-500/80 transition-colors"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
        </button>
      </div>
    </header>
  );
}
