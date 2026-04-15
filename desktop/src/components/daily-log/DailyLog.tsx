import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "../../lib/api";
import { getDateString, formatDate, formatNumber, addDays } from "../../lib/utils";
import { CommitTimeline } from "../dashboard/CommitTimeline";
import type { Commit, DailySummary, ModuleActivity } from "../../lib/types";

interface DailyLogProps {
  repoId: number;
}

export function DailyLog({ repoId }: DailyLogProps) {
  const todayStr = getDateString();
  const [currentDate, setCurrentDate] = useState(todayStr);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [modules, setModules] = useState<ModuleActivity[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [direction, setDirection] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [c, s, m] = await Promise.all([
        api.getCommitsByDate(repoId, currentDate),
        api.getDailySummary(repoId, currentDate),
        api.getModuleActivityByDate(repoId, currentDate),
      ]);
      setCommits(c);
      setSummary(s);
      setModules(m);
      setNotesDraft(s?.user_notes ?? "");
    } catch (e) {
      console.error("Failed to load daily log:", e);
    }
  }, [repoId, currentDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditing) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setDirection(-1);
        setCurrentDate((d) => addDays(d, -1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setDirection(1);
        setCurrentDate((d) => addDays(d, 1));
      } else if (e.key === "e" || e.key === "E") {
        setIsEditing(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing]);

  async function saveNotes() {
    try {
      await api.updateUserNotes(repoId, currentDate, notesDraft);
      setIsEditing(false);
      loadData();
    } catch (e) {
      console.error("Failed to save notes:", e);
    }
  }

  const isToday = currentDate === todayStr;
  const totalAdded = summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0);
  const totalRemoved = summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0);
  const totalFiles = summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0);

  return (
    <div className="space-y-6">
      {/* Date navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => { setDirection(-1); setCurrentDate((d) => addDays(d, -1)); }}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-1 hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <AnimatePresence mode="wait">
          <motion.h2
            key={currentDate}
            initial={{ opacity: 0, x: direction * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -20 }}
            transition={{ duration: 0.15 }}
            className="text-lg font-semibold text-text-primary"
          >
            {formatDate(currentDate)}
            {isToday && <span className="text-streak ml-2 text-sm font-normal">(today)</span>}
          </motion.h2>
        </AnimatePresence>
        <button
          onClick={() => { setDirection(1); setCurrentDate((d) => addDays(d, 1)); }}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-1 hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        {!isToday && (
          <button
            onClick={() => { setDirection(1); setCurrentDate(todayStr); }}
            className="text-xs text-brand hover:text-brand/80 transition-colors ml-2"
          >
            Jump to today
          </button>
        )}
      </div>

      {/* Day stats */}
      <div className="glass p-5">
        <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Activity</h3>
        {commits.length === 0 ? (
          <p className="text-text-dim text-sm">No commits on this day.</p>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="text-brand font-bold font-mono text-xl">{formatNumber(commits.length)}</div>
              <div className="text-text-dim text-xs">commits</div>
            </div>
            <div>
              <div className="text-positive font-bold font-mono text-xl">+{formatNumber(totalAdded)}</div>
              <div className="text-text-dim text-xs">added</div>
            </div>
            <div>
              <div className="text-negative font-bold font-mono text-xl">-{formatNumber(totalRemoved)}</div>
              <div className="text-text-dim text-xs">removed</div>
            </div>
            <div>
              <div className="text-brand font-bold font-mono text-xl">{formatNumber(totalFiles)}</div>
              <div className="text-text-dim text-xs">files touched</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Notes + AI Summary */}
        <div className="space-y-6">
          {/* Notes */}
          <div className="glass p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider">Notes</h3>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-text-dim hover:text-brand transition-colors flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <div>
                <textarea
                  className="w-full bg-surface-2 border border-border-active rounded-lg p-3 text-text-primary text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-brand/30"
                  rows={5}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Write your notes for the day..."
                  autoFocus
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={saveNotes}
                    className="px-3 py-1.5 bg-brand text-surface rounded-lg text-xs font-semibold hover:bg-brand/80 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setIsEditing(false); setNotesDraft(summary?.user_notes ?? ""); }}
                    className="px-3 py-1.5 bg-surface-2 text-text-secondary rounded-lg text-xs hover:bg-surface-3 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm">
                {notesDraft ? (
                  <p className="text-text-primary whitespace-pre-wrap">{notesDraft}</p>
                ) : (
                  <p className="text-text-dim italic">No notes yet. Press E to add notes.</p>
                )}
              </div>
            )}
          </div>

          {/* AI Summary */}
          {summary?.ai_draft && (
            <div className="glass p-5">
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">AI Summary</h3>
              <p className="text-text-primary text-sm whitespace-pre-wrap">{summary.ai_draft}</p>
            </div>
          )}

          {/* Modules */}
          {modules.length > 0 && (
            <div className="glass p-5">
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Areas</h3>
              <div className="space-y-2">
                {modules.slice(0, 6).map((m) => (
                  <div key={m.module} className="flex items-center gap-3">
                    <span className="text-text-secondary text-xs font-mono w-28 truncate">{m.module}</span>
                    <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-brand/60 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${m.percentage}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span className="text-text-dim text-xs font-mono w-10 text-right">{Math.round(m.percentage)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Commits */}
        <div className="glass p-5">
          <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Commits</h3>
          <CommitTimeline commits={commits} />
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="text-text-dim text-xs flex gap-6">
        <span><kbd className="bg-surface-2 px-1.5 py-0.5 rounded text-[10px]">&#8592;</kbd> <kbd className="bg-surface-2 px-1.5 py-0.5 rounded text-[10px]">&#8594;</kbd> Navigate days</span>
        <span><kbd className="bg-surface-2 px-1.5 py-0.5 rounded text-[10px]">E</kbd> Edit notes</span>
      </div>
    </div>
  );
}
