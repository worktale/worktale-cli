import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { View } from "../../lib/types";
import * as api from "../../lib/api";

interface CommandPaletteProps {
  onNavigate: (view: View) => void;
  repoId: number;
  cloudConnected: boolean;
}

interface Command {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  action: () => void;
  category: string;
}

export function CommandPalette({ onNavigate, repoId, cloudConnected }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        setQuery("");
        setSelectedIndex(0);
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    function handler() { toggle(); }
    document.addEventListener("toggle-command-palette", handler);
    return () => document.removeEventListener("toggle-command-palette", handler);
  }, [toggle]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands: Command[] = [
    // Navigation
    { id: "nav-dashboard", label: "Dashboard", description: "View today's overview", shortcut: "^1", action: () => onNavigate("overview"), category: "Navigation" },
    { id: "nav-daily-log", label: "Daily Log", description: "Browse daily activity", shortcut: "^2", action: () => onNavigate("daily-log"), category: "Navigation" },
    { id: "nav-history", label: "History", description: "View all-time stats & heatmap", shortcut: "^3", action: () => onNavigate("history"), category: "Navigation" },
    { id: "nav-digest", label: "Digest Editor", description: "Edit and publish digests", shortcut: "^4", action: () => onNavigate("digest"), category: "Navigation" },
    { id: "nav-cloud", label: "Cloud", description: "Manage cloud account", shortcut: "^5", action: () => onNavigate("cloud"), category: "Navigation" },
    { id: "nav-repos", label: "Repositories", description: "Manage tracked repos", shortcut: "^6", action: () => onNavigate("repos"), category: "Navigation" },
    { id: "nav-settings", label: "Settings", description: "Configure Worktale", shortcut: "^7", action: () => onNavigate("settings"), category: "Navigation" },
    // Actions
    {
      id: "action-generate-digest", label: "Generate Digest", description: "Generate today's digest",
      action: async () => {
        onNavigate("digest");
      },
      category: "Actions",
    },
    {
      id: "action-publish", label: "Publish to Cloud", description: "Publish today's digest",
      action: async () => {
        if (cloudConnected) {
          const today = new Date().toISOString().split("T")[0];
          try { await api.cloudPublishDaily(repoId, today); } catch {}
        }
        onNavigate("cloud");
      },
      category: "Actions",
    },
    {
      id: "action-standup", label: "Generate Standup", description: "AI-powered standup report",
      action: () => onNavigate("cloud"),
      category: "Actions",
    },
    {
      id: "action-open-profile", label: "Open Profile", description: "Open your profile in browser",
      action: async () => {
        if (cloudConnected) {
          try {
            const profile = await api.cloudGetProfile();
            api.openInBrowser(`https://worktale.dev/${profile.username}`);
          } catch {}
        }
      },
      category: "Actions",
    },
  ];

  const filtered = query
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.description.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Group by category
  const grouped = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    (acc[cmd.category] ??= []).push(cmd);
    return acc;
  }, {});

  let globalIndex = 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[560px] z-50"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <div className="glass overflow-hidden shadow-2xl shadow-black/50">
              {/* Search input */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a command..."
                  className="flex-1 bg-transparent text-text-primary text-sm focus:outline-none placeholder-text-dim"
                />
                <kbd className="text-[10px] text-text-dim bg-surface-2 px-1.5 py-0.5 rounded">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-[360px] overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-text-dim text-sm">No commands found.</div>
                ) : (
                  Object.entries(grouped).map(([category, cmds]) => (
                    <div key={category}>
                      <div className="px-4 py-1">
                        <span className="text-text-dim text-[10px] uppercase tracking-wider">{category}</span>
                      </div>
                      {cmds.map((cmd) => {
                        const idx = globalIndex++;
                        const isSelected = idx === selectedIndex;
                        return (
                          <button
                            key={cmd.id}
                            className={`w-full px-4 py-2 flex items-center justify-between text-left transition-colors ${
                              isSelected ? "bg-brand/10 text-brand" : "text-text-secondary hover:bg-surface-2"
                            }`}
                            onClick={() => { cmd.action(); setOpen(false); }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                          >
                            <div>
                              <span className="text-sm font-medium">{cmd.label}</span>
                              <span className="text-text-dim text-xs ml-2">{cmd.description}</span>
                            </div>
                            {cmd.shortcut && (
                              <kbd className="text-[10px] text-text-dim bg-surface-2 px-1.5 py-0.5 rounded">{cmd.shortcut}</kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
