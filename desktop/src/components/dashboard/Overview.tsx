import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import * as api from "../../lib/api";
import { getDateString, getWeekDatesForDate, formatDate, formatNumber, formatDuration, addDays } from "../../lib/utils";
import { StreakCounter } from "./StreakCounter";
import { WeekChart } from "./WeekChart";
import { CommitTimeline } from "./CommitTimeline";
import { HeatmapGrid } from "./HeatmapGrid";
import { AiSessionStats } from "./AiSessionStats";
import type { Commit, DailySummary, StreakInfo, DayCommitStats } from "../../lib/types";

interface OverviewProps {
  repoId: number;
}

export function Overview({ repoId }: OverviewProps) {
  const todayStr = getDateString();
  const [currentDate, setCurrentDate] = useState(todayStr);
  const isToday = currentDate === todayStr;

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
        const weekDates = getWeekDatesForDate(currentDate);

        const [dateCommits, dateSummary, streak, weekCommitStats, time, unpub] = await Promise.all([
          api.getCommitsByDate(repoId, currentDate),
          api.getDailySummary(repoId, currentDate),
          api.getStreakInfo(repoId),
          api.getCommitStatsRange(repoId, weekDates[0], weekDates[6]),
          api.getEstimatedCodingTime(repoId, currentDate),
          api.getUnpublishedDays(repoId),
        ]);

        setCommits(dateCommits);
        setSummary(dateSummary);
        setStreakInfo(streak);
        setRecentCommits(dateCommits);
        setCodingTime(time);
        setUnpublished(unpub);

        // Week data sourced directly from commits table
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const statsMap = new Map(weekCommitStats.map((s: DayCommitStats) => [s.date, s]));
        setWeekData(weekDates.map((date, i) => ({
          day: dayNames[i],
          value: statsMap.get(date)?.lines_added ?? 0,
          isToday: date === todayStr,
        })));

        // Heatmap data (last 52 weeks) — sourced from commits table
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        const yearCommitStats = await api.getCommitStatsRange(repoId, getDateString(yearAgo), todayStr);
        const hmap = new Map<string, number>();
        for (const s of yearCommitStats) hmap.set(s.date, s.commits);
        setHeatmapData(hmap);
      } catch (e) {
        console.error("Failed to load overview data:", e);
      }
    }
    load();
  }, [repoId, currentDate, todayStr]);

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
      {/* Date navigation */}
      <motion.div variants={fadeUp} className="flex items-center gap-3">
        <button
          onClick={() => setCurrentDate((d) => addDays(d, -1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-1 hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 className="text-lg font-semibold text-text-primary min-w-[280px] text-center">
          {formatDate(currentDate)}
          {isToday && <span className="text-streak ml-2 text-xs font-normal">(today)</span>}
        </h2>
        <button
          onClick={() => setCurrentDate((d) => addDays(d, 1))}
          disabled={isToday}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-1 hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        {!isToday && (
          <button
            onClick={() => setCurrentDate(todayStr)}
            className="px-3 py-1 bg-surface-1 hover:bg-surface-2 text-text-secondary hover:text-text-primary text-xs rounded-md transition-all"
          >
            Today
          </button>
        )}
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

      {/* Stats for selected date */}
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
          {/* Commits for selected date */}
          <motion.div variants={fadeUp} className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">
              {isToday ? "Today's Commits" : "Commits"}
            </h3>
            <CommitTimeline commits={recentCommits} />
          </motion.div>
        </div>
      </div>

      {/* AI Sessions */}
      <motion.div variants={fadeUp}>
        <AiSessionStats repoId={repoId} date={currentDate} />
      </motion.div>

      {/* Heatmap */}
      <motion.div variants={fadeUp} className="glass p-5">
        <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Activity — Last 52 Weeks</h3>
        <HeatmapGrid data={heatmapData} />
      </motion.div>
    </motion.div>
  );
}
