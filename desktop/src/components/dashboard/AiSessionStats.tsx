import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import * as api from "../../lib/api";
import { getDateString, formatNumber } from "../../lib/utils";
import type { AiSession, AiSessionStats as AiStats } from "../../lib/types";

interface AiSessionStatsProps {
  repoId: number;
}

export function AiSessionStats({ repoId }: AiSessionStatsProps) {
  const [todaySessions, setTodaySessions] = useState<AiSession[]>([]);
  const [stats, setStats] = useState<AiStats | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const today = getDateString();
        const [sessions, allStats] = await Promise.all([
          api.getAiSessionsByDate(repoId, today),
          api.getAiSessionStats(repoId, 30),
        ]);
        setTodaySessions(sessions);
        setStats(allStats);
      } catch (e) {
        console.error("Failed to load AI session data:", e);
      }
    }
    load();
  }, [repoId]);

  if (!stats || stats.total_sessions === 0) return null;

  const todayCost = todaySessions.reduce((s, a) => s + a.cost_usd, 0);
  const todayTokens = todaySessions.reduce(
    (s, a) => s + a.input_tokens + a.output_tokens,
    0,
  );
  const todayTools = [...new Set(todaySessions.map((a) => a.tool).filter(Boolean))] as string[];

  return (
    <motion.div
      className="glass p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">
        AI Assist
      </h3>

      <div className="grid grid-cols-2 gap-6">
        {/* Today */}
        <div className="space-y-3">
          <span className="text-text-dim text-[10px] uppercase tracking-wider">Today</span>
          {todaySessions.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-brand font-bold font-mono text-2xl">{todaySessions.length}</span>
                <span className="text-text-dim text-xs">session{todaySessions.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex gap-4 text-xs font-mono">
                {todayTokens > 0 && (
                  <span className="text-text-secondary">{formatNumber(todayTokens)} tokens</span>
                )}
                {todayCost > 0 && (
                  <span className="text-streak">${todayCost.toFixed(4)}</span>
                )}
              </div>
              {todayTools.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {todayTools.map((t) => (
                    <span key={t} className="text-[10px] bg-brand/10 text-brand px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-text-dim text-xs">No AI sessions today</p>
          )}
        </div>

        {/* 30-day stats */}
        <div className="space-y-3">
          <span className="text-text-dim text-[10px] uppercase tracking-wider">Last 30 Days</span>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-dim">Sessions</span>
              <span className="text-text-primary font-mono">{stats.total_sessions}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-dim">Total Cost</span>
              <span className="text-streak font-mono">${stats.total_cost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-dim">Tokens</span>
              <span className="text-text-primary font-mono">{formatNumber(stats.total_input_tokens + stats.total_output_tokens)}</span>
            </div>
            {stats.tools.length > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-text-dim">Top Tool</span>
                <span className="text-brand font-mono">{stats.tools[0][0]}</span>
              </div>
            )}
            {stats.models.length > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-text-dim">Top Model</span>
                <span className="text-text-secondary font-mono text-[11px]">{stats.models[0][0]}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tool distribution bar */}
      {stats.tools.length > 1 && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex h-2 rounded-full overflow-hidden gap-px">
            {stats.tools.map(([tool, count], i) => {
              const pct = (count / stats.total_sessions) * 100;
              const colors = ["bg-brand", "bg-streak", "bg-blue-400", "bg-purple-400", "bg-pink-400"];
              return (
                <div
                  key={tool}
                  className={`${colors[i % colors.length]} rounded-sm`}
                  style={{ width: `${pct}%` }}
                  title={`${tool}: ${count} sessions (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <div className="flex gap-3 mt-2">
            {stats.tools.map(([tool, count], i) => {
              const colors = ["text-brand", "text-streak", "text-blue-400", "text-purple-400", "text-pink-400"];
              return (
                <span key={tool} className={`text-[10px] ${colors[i % colors.length]}`}>
                  {tool} ({count})
                </span>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
