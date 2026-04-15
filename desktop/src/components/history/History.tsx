import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import * as api from "../../lib/api";
import { getDateString, formatNumber } from "../../lib/utils";
import { HeatmapGrid } from "../dashboard/HeatmapGrid";
import { StatBar } from "./StatBar";
import type { StreakInfo, MostActiveMonth, ModuleActivity, Milestone, HourDistribution } from "../../lib/types";

interface HistoryProps {
  repoId: number;
}

export function History({ repoId }: HistoryProps) {
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [totalCommits, setTotalCommits] = useState(0);
  const [totalAdded, setTotalAdded] = useState(0);
  const [totalRemoved, setTotalRemoved] = useState(0);
  const [daysActive, setDaysActive] = useState(0);
  const [streakInfo, setStreakInfo] = useState<StreakInfo>({ current: 0, best: 0, best_start: "", best_end: "" });
  const [mostActive, setMostActive] = useState<MostActiveMonth>({ month: "", commits: 0 });
  const [topModules, setTopModules] = useState<ModuleActivity[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [hourDist, setHourDist] = useState<HourDistribution[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const todayStr = getDateString();
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        const [summaries, count, dates, streak, active, modules, ms, hours] = await Promise.all([
          api.getDailySummariesRange(repoId, getDateString(yearAgo), todayStr),
          api.getCommitCount(repoId),
          api.getActiveDates(repoId),
          api.getStreakInfo(repoId),
          api.getMostActiveMonth(repoId),
          api.getTopModules(repoId, 8),
          api.getMilestones(repoId, 10),
          api.getWorkingHourDistribution(repoId),
        ]);

        const hmap = new Map<string, number>();
        let addedSum = 0, removedSum = 0;
        for (const s of summaries) {
          hmap.set(s.date, s.commits_count);
          addedSum += s.lines_added;
          removedSum += s.lines_removed;
        }
        setHeatmapData(hmap);
        setTotalAdded(addedSum);
        setTotalRemoved(removedSum);
        setTotalCommits(count);
        setDaysActive(dates.length);
        setStreakInfo(streak);
        setMostActive(active);
        setTopModules(modules);
        setMilestones(ms);
        setHourDist(hours);
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    }
    load();
  }, [repoId]);

  const avgPerDay = daysActive > 0 ? (totalCommits / daysActive).toFixed(1) : "0";
  const maxModuleChanges = topModules.length > 0 ? topModules[0].changes : 1;
  const maxHourCommits = Math.max(...hourDist.map(h => h.commits), 1);

  const allTimeStats = [
    { label: "Total commits", value: formatNumber(totalCommits), color: "text-brand" },
    { label: "Days active", value: formatNumber(daysActive), color: "text-brand" },
    { label: "Avg/day", value: avgPerDay, color: "text-brand" },
    { label: "Longest streak", value: `${streakInfo.best} days`, color: "text-streak" },
    { label: "Lines written", value: `+${formatNumber(totalAdded)}`, color: "text-positive" },
    { label: "Lines removed", value: `-${formatNumber(totalRemoved)}`, color: "text-negative" },
    { label: "Most active", value: mostActive.month || "--", color: "text-brand" },
    { label: "Peak commits", value: mostActive.commits > 0 ? formatNumber(mostActive.commits) : "--", color: "text-text-secondary" },
  ];

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      {/* Heatmap */}
      <motion.div variants={fadeUp} className="glass p-5">
        <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Activity — Last 52 Weeks</h3>
        <HeatmapGrid data={heatmapData} />
      </motion.div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <motion.div variants={fadeUp} className="glass p-5">
          <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-3">Milestones</h3>
          <div className="grid grid-cols-2 gap-2">
            {milestones.slice(0, 6).map((m, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-surface-2 rounded-lg">
                <span className="text-streak">&#127991;&#65039;</span>
                <span className="text-text-primary font-mono text-sm font-bold">{m.tag}</span>
                <span className="text-text-dim text-xs ml-auto">{m.date}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* All-time stats */}
      <motion.div variants={fadeUp} className="glass p-5">
        <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">All-Time Stats</h3>
        <div className="grid grid-cols-4 gap-4">
          {allTimeStats.map((stat) => (
            <div key={stat.label} className="bg-surface-2 rounded-lg p-3">
              <div className={`font-bold font-mono text-lg ${stat.color}`}>{stat.value}</div>
              <div className="text-text-dim text-xs mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top modules */}
        {topModules.length > 0 && (
          <motion.div variants={fadeUp} className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Top Modules</h3>
            <div className="space-y-2">
              {topModules.map((mod) => (
                <StatBar key={mod.module} label={mod.module} value={mod.changes} maxValue={maxModuleChanges} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Working hours heatmap */}
        <motion.div variants={fadeUp} className="glass p-5">
          <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Coding Hours</h3>
          <div className="grid grid-cols-12 gap-1">
            {hourDist.map((h) => {
              const intensity = h.commits / maxHourCommits;
              const bg = intensity === 0
                ? "bg-surface-2"
                : intensity < 0.25
                  ? "bg-brand/20"
                  : intensity < 0.5
                    ? "bg-brand/40"
                    : intensity < 0.75
                      ? "bg-brand/60"
                      : "bg-brand";
              return (
                <div key={h.hour} className="text-center" title={`${h.hour}:00 — ${h.commits} commits`}>
                  <div className={`h-6 rounded-sm ${bg} transition-colors`} />
                  {h.hour % 3 === 0 && (
                    <span className="text-text-dim text-[9px]">{h.hour}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-text-dim text-[10px]">12am</span>
            <span className="text-text-dim text-[10px]">12pm</span>
            <span className="text-text-dim text-[10px]">11pm</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
