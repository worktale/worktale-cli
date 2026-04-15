import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import * as api from "../../lib/api";
import { getDateString, getWeekDates, formatDate, formatNumber, formatDuration } from "../../lib/utils";
import { StreakCounter } from "./StreakCounter";
import { WeekChart } from "./WeekChart";
import { CommitTimeline } from "./CommitTimeline";
import { HeatmapGrid } from "./HeatmapGrid";
import { AiSessionStats } from "./AiSessionStats";
import type { Commit, DailySummary, StreakInfo } from "../../lib/types";

interface OverviewProps {
  repoId: number;
}

export function Overview({ repoId }: OverviewProps) {
  const [todayStr] = useState(() => getDateString());
  const [commits, setCommits] = useState<Commit[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [streakInfo, setStreakInfo] = useState<StreakInfo>({ current: 0, best: 0, best_start: "", best_end: "" });
  const [weekData, setWeekData] = useState<{ day: string; value: number; isToday: boolean }[]>([]);
  const [recentCommits, setRecentCommits] = useState<Commit[]>([]);
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [codingTime, setCodingTime] = useState(0);
  const [unpublished, setUnpublished] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [todayCommits, todaySummary, streak, recent, time, unpub] = await Promise.all([
          api.getCommitsByDate(repoId, todayStr),
          api.getDailySummary(repoId, todayStr),
          api.getStreakInfo(repoId),
          api.getRecentCommits(repoId, 8),
          api.getEstimatedCodingTime(repoId, todayStr),
          api.getUnpublishedDays(repoId),
        ]);

        setCommits(todayCommits);
        setSummary(todaySummary);
        setStreakInfo(streak);
        setRecentCommits(recent);
        setCodingTime(time);
        setUnpublished(unpub);

        // Week data
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];
        const weekDates = getWeekDates();
        const weekSummaries = await api.getDailySummariesRange(repoId, weekDates[0], weekDates[weekDates.length - 1]);
        const summaryMap = new Map(weekSummaries.map((s) => [s.date, s]));
        setWeekData(weekDates.map((date, i) => ({
          day: dayNames[i],
          value: summaryMap.get(date)?.lines_added ?? 0,
          isToday: date === todayStr,
        })));

        // Heatmap data (last 52 weeks)
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        const yearSummaries = await api.getDailySummariesRange(repoId, getDateString(yearAgo), todayStr);
        const hmap = new Map<string, number>();
        for (const s of yearSummaries) hmap.set(s.date, s.commits_count);
        setHeatmapData(hmap);
      } catch (e) {
        console.error("Failed to load overview data:", e);
      }
    }
    load();
  }, [repoId, todayStr]);

  const todayAdded = summary?.lines_added ?? commits.reduce((s, c) => s + c.lines_added, 0);
  const todayRemoved = summary?.lines_removed ?? commits.reduce((s, c) => s + c.lines_removed, 0);
  const todayFiles = summary?.files_touched ?? commits.reduce((s, c) => s + c.files_changed, 0);

  const stats = [
    { label: "Commits", value: formatNumber(commits.length), color: "text-brand" },
    { label: "Added", value: `+${formatNumber(todayAdded)}`, color: "text-positive" },
    { label: "Removed", value: `-${formatNumber(todayRemoved)}`, color: "text-negative" },
    { label: "Files", value: formatNumber(todayFiles), color: "text-brand" },
    { label: "Coding", value: formatDuration(codingTime), color: "text-brand" },
  ];

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      {/* Date */}
      <motion.div variants={fadeUp}>
        <h2 className="text-lg font-semibold text-text-primary">{formatDate(todayStr)}</h2>
      </motion.div>

      {/* Unpublished banner */}
      {unpublished > 0 && (
        <motion.div variants={fadeUp} className="glass px-4 py-3 flex items-center gap-3 border-streak/20">
          <span className="text-streak">&#9889;</span>
          <span className="text-text-secondary text-sm flex-1">
            <span className="text-streak font-bold">{unpublished}</span> day{unpublished !== 1 ? "s" : ""} with commits not yet published to Cloud.
          </span>
          <button
            onClick={async () => {
              await api.markAllPublished(repoId);
              setUnpublished(0);
            }}
            className="px-3 py-1 bg-surface-2 hover:bg-surface-3 text-text-secondary text-xs rounded-md transition-colors flex-shrink-0"
          >
            Mark all published
          </button>
          <button
            onClick={() => setUnpublished(0)}
            className="text-text-dim hover:text-text-secondary transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </motion.div>
      )}

      {/* Today's stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-5 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="glass p-4 text-center glass-hover transition-all duration-200">
            <div className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</div>
            <div className="text-text-dim text-xs mt-1 uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Streak */}
          <motion.div variants={fadeUp}>
            <StreakCounter current={streakInfo.current} best={streakInfo.best} />
          </motion.div>

          {/* Week chart */}
          <motion.div variants={fadeUp} className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">This Week</h3>
            <WeekChart data={weekData} />
          </motion.div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Recent commits */}
          <motion.div variants={fadeUp} className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Recent Commits</h3>
            <CommitTimeline commits={recentCommits} />
          </motion.div>
        </div>
      </div>

      {/* AI Sessions */}
      <motion.div variants={fadeUp}>
        <AiSessionStats repoId={repoId} />
      </motion.div>

      {/* Heatmap */}
      <motion.div variants={fadeUp} className="glass p-5">
        <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Activity — Last 52 Weeks</h3>
        <HeatmapGrid data={heatmapData} />
      </motion.div>
    </motion.div>
  );
}
