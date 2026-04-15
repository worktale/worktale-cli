import { useState, useEffect, useCallback } from "react";
import * as api from "../lib/api";
import type { Repo, StreakInfo, GlobalConfig, View } from "../lib/types";

export function useWorktale() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [activeRepo, setActiveRepo] = useState<Repo | null>(null);
  const [streak, setStreak] = useState<StreakInfo>({
    current: 0,
    best: 0,
    best_start: "",
    best_end: "",
  });
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [cloudConnected, setCloudConnected] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRepos = useCallback(async () => {
    try {
      const allRepos = await api.getAllRepos();
      setRepos(allRepos);
      setActiveRepo((prev) => {
        if (prev) return prev;
        return allRepos.length > 0 ? allRepos[0] : null;
      });
    } catch (e) {
      setError(`Failed to load repos: ${e}`);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      const connected = await api.cloudIsConfigured();
      setCloudConnected(connected);
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  }, []);

  const loadStreak = useCallback(async () => {
    if (!activeRepo) return;
    try {
      const info = await api.getStreakInfo(activeRepo.id);
      setStreak(info);
    } catch (e) {
      console.error("Failed to load streak:", e);
    }
  }, [activeRepo]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadRepos();
      await loadConfig();
      setLoading(false);
    }
    init();
  }, [loadRepos, loadConfig]);

  useEffect(() => {
    loadStreak();
  }, [loadStreak]);

  const switchRepo = useCallback(
    (repo: Repo) => {
      setActiveRepo(repo);
    },
    [],
  );

  const refresh = useCallback(async () => {
    await loadRepos();
    await loadConfig();
    await loadStreak();
  }, [loadRepos, loadConfig, loadStreak]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.getAttribute("contenteditable")) {
        return;
      }
      // Check for Ctrl/Cmd modifier for tab shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case "1":
            e.preventDefault();
            setView("overview");
            break;
          case "2":
            e.preventDefault();
            setView("daily-log");
            break;
          case "3":
            e.preventDefault();
            setView("history");
            break;
          case "4":
            e.preventDefault();
            setView("digest");
            break;
          case "5":
            e.preventDefault();
            setView("ai");
            break;
          case "6":
            e.preventDefault();
            setView("cloud");
            break;
          case "7":
            e.preventDefault();
            setView("repos");
            break;
          case "8":
            e.preventDefault();
            setView("settings");
            break;
          case "k":
            e.preventDefault();
            document.dispatchEvent(new CustomEvent("toggle-command-palette"));
            break;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    repos,
    activeRepo,
    streak,
    config,
    cloudConnected,
    view,
    setView,
    switchRepo,
    loading,
    error,
    refresh,
  };
}
