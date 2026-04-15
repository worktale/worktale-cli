import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import * as api from "../../lib/api";
import { getDateString, formatNumber, formatDuration, formatDateShort } from "../../lib/utils";
import type { AiSession, AiSessionStats, DailyAiSummary } from "../../lib/types";

interface AiViewProps {
  repoId: number;
}

type AiTab = "overview" | "sessions" | "models" | "tools";

export function AiView({ repoId }: AiViewProps) {
  const [activeTab, setActiveTab] = useState<AiTab>("overview");
  const [stats, setStats] = useState<AiSessionStats | null>(null);
  const [todaySessions, setTodaySessions] = useState<AiSession[]>([]);
  const [recentSessions, setRecentSessions] = useState<AiSession[]>([]);
  const [dailySummary, setDailySummary] = useState<DailyAiSummary[]>([]);
  const [statsDays, setStatsDays] = useState(30);

  useEffect(() => {
    async function load() {
      try {
        const today = getDateString();
        const since = new Date();
        since.setDate(since.getDate() - statsDays);
        const sinceStr = getDateString(since);

        const [s, todayS, daily] = await Promise.all([
          api.getAiSessionStats(repoId, statsDays),
          api.getAiSessionsByDate(repoId, today),
          api.getDailyAiSummary(repoId, sinceStr, today),
        ]);

        setStats(s);
        setTodaySessions(todayS);
        setDailySummary(daily);

        // Load last 7 days of sessions for the sessions tab
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekSessions: AiSession[] = [];
        for (let d = new Date(); d >= weekAgo; d.setDate(d.getDate() - 1)) {
          const ds = getDateString(d);
          const daySessions = await api.getAiSessionsByDate(repoId, ds);
          weekSessions.push(...daySessions);
        }
        setRecentSessions(weekSessions);
      } catch (e) {
        console.error("Failed to load AI data:", e);
      }
    }
    load();
  }, [repoId, statsDays]);

  const tabs: { key: AiTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "sessions", label: "Sessions" },
    { key: "models", label: "Models & Providers" },
    { key: "tools", label: "Agent Tools" },
  ];

  const totalTokens = stats ? stats.total_input_tokens + stats.total_output_tokens : 0;
  const maxDailyCost = Math.max(...dailySummary.map((d) => d.cost), 0.01);
  const maxDailyTokens = Math.max(...dailySummary.map((d) => d.tokens), 1);

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
  const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-surface-1 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-surface-3 text-brand"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-text-dim text-xs">Period:</span>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setStatsDays(d)}
              className={`px-2.5 py-1 rounded text-xs transition-all ${
                statsDays === d ? "bg-brand/15 text-brand" : "text-text-dim hover:text-text-secondary"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && stats && (
        <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
          {/* KPI cards */}
          <motion.div variants={fadeUp} className="grid grid-cols-5 gap-3">
            {[
              { label: "Sessions", value: String(stats.total_sessions), color: "text-brand" },
              { label: "Total Cost", value: `$${stats.total_cost.toFixed(2)}`, color: "text-streak" },
              { label: "Input Tokens", value: formatNumber(stats.total_input_tokens), color: "text-positive" },
              { label: "Output Tokens", value: formatNumber(stats.total_output_tokens), color: "text-blue-400" },
              { label: "AI Time", value: formatDuration(Math.round(stats.total_duration_secs / 60)), color: "text-brand" },
            ].map((stat) => (
              <div key={stat.label} className="glass p-4 text-center glass-hover transition-all">
                <div className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</div>
                <div className="text-text-dim text-xs mt-1 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* Cost chart */}
          {dailySummary.length > 0 && (
            <motion.div variants={fadeUp} className="glass p-5">
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Daily Cost</h3>
              <div className="flex items-end gap-[2px]" style={{ height: 96 }}>
                {dailySummary.map((day) => {
                  const pct = maxDailyCost > 0 ? (day.cost / maxDailyCost) : 0;
                  const barHeight = Math.max(Math.round(pct * 96), 2);
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex items-end"
                      title={`${day.date}: $${day.cost.toFixed(4)} · ${day.sessions} sessions · ${formatNumber(day.tokens)} tokens`}
                    >
                      <div
                        className="w-full bg-streak/60 hover:bg-streak rounded-t-sm transition-colors cursor-pointer"
                        style={{ height: barHeight }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-text-dim text-[10px]">{dailySummary[0]?.date}</span>
                <span className="text-text-dim text-[10px]">{dailySummary[dailySummary.length - 1]?.date}</span>
              </div>
            </motion.div>
          )}

          {/* Token usage chart */}
          {dailySummary.length > 0 && (
            <motion.div variants={fadeUp} className="glass p-5">
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Daily Token Usage</h3>
              <div className="flex items-end gap-[2px]" style={{ height: 96 }}>
                {dailySummary.map((day) => {
                  const pct = maxDailyTokens > 0 ? (day.tokens / maxDailyTokens) : 0;
                  const barHeight = Math.max(Math.round(pct * 96), 2);
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex items-end"
                      title={`${day.date}: ${formatNumber(day.tokens)} tokens`}
                    >
                      <div
                        className="w-full bg-brand/60 hover:bg-brand rounded-t-sm transition-colors cursor-pointer"
                        style={{ height: barHeight }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-text-dim text-[10px]">{dailySummary[0]?.date}</span>
                <span className="text-text-dim text-[10px]">{dailySummary[dailySummary.length - 1]?.date}</span>
              </div>
            </motion.div>
          )}

          {/* Tool distribution + today */}
          <div className="grid grid-cols-2 gap-6">
            {/* Tool distribution */}
            {stats.tools.length > 0 && (
              <motion.div variants={fadeUp} className="glass p-5">
                <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Tool Distribution</h3>
                <div className="space-y-3">
                  {stats.tools.map(([tool, count]) => {
                    const pct = (count / stats.total_sessions) * 100;
                    return (
                      <div key={tool} className="flex items-center gap-3">
                        <span className="text-text-secondary text-sm font-mono w-28 truncate">{tool}</span>
                        <div className="flex-1 h-3 bg-surface-2 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-brand rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6 }}
                          />
                        </div>
                        <span className="text-text-dim text-xs font-mono w-16 text-right">{count} ({Math.round(pct)}%)</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Today's sessions */}
            <motion.div variants={fadeUp} className="glass p-5">
              <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Today's Sessions</h3>
              {todaySessions.length > 0 ? (
                <div className="space-y-2">
                  {todaySessions.map((s) => (
                    <div key={s.id} className="bg-surface-2 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-brand text-xs font-bold">{s.tool ?? "unknown"}</span>
                          <span className="text-text-dim text-[10px]">{s.model}</span>
                        </div>
                        <div className="flex gap-3 text-[10px] font-mono">
                          {(s.input_tokens + s.output_tokens) > 0 && (
                            <span className="text-text-secondary">{formatNumber(s.input_tokens + s.output_tokens)} tok</span>
                          )}
                          {s.cost_usd > 0 && <span className="text-streak">${s.cost_usd.toFixed(4)}</span>}
                        </div>
                      </div>
                      {s.note && <p className="text-text-secondary text-xs leading-snug">{s.note}</p>}
                      {s.tools_used && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {(JSON.parse(s.tools_used) as string[]).map((t) => (
                            <span key={t} className="text-[9px] bg-surface-3 text-text-dim px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-text-dim text-sm">No AI sessions today.</p>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Sessions Tab */}
      {activeTab === "sessions" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {recentSessions.length > 0 ? (
            (() => {
              let currentDate = "";
              return recentSessions.map((s) => {
                const showDate = s.date !== currentDate;
                if (showDate) currentDate = s.date;
                return (
                  <div key={s.id}>
                    {showDate && (
                      <h4 className="text-text-primary font-semibold text-sm mt-4 mb-2">{formatDateShort(s.date)}</h4>
                    )}
                    <div className="glass p-4 glass-hover transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-brand font-bold text-sm">{s.tool ?? "unknown"}</span>
                          <span className="text-text-dim text-xs font-mono">{s.model}</span>
                          <span className="text-text-dim text-xs">{s.provider}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono">
                          {(s.input_tokens + s.output_tokens) > 0 && (
                            <span className="text-text-secondary">
                              <span className="text-positive">{formatNumber(s.input_tokens)}</span>
                              <span className="text-text-dim"> in / </span>
                              <span className="text-blue-400">{formatNumber(s.output_tokens)}</span>
                              <span className="text-text-dim"> out</span>
                            </span>
                          )}
                          {s.cost_usd > 0 && <span className="text-streak font-bold">${s.cost_usd.toFixed(4)}</span>}
                          {s.duration_secs > 0 && (
                            <span className="text-text-dim">{formatDuration(Math.round(s.duration_secs / 60))}</span>
                          )}
                        </div>
                      </div>
                      {s.note && <p className="text-text-primary text-sm mb-2">{s.note}</p>}
                      <div className="flex gap-4">
                        {s.tools_used && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-text-dim text-[10px]">Tools:</span>
                            {(JSON.parse(s.tools_used) as string[]).map((t) => (
                              <span key={t} className="text-[10px] bg-brand/10 text-brand px-1.5 py-0.5 rounded">{t}</span>
                            ))}
                          </div>
                        )}
                        {s.mcp_servers && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-text-dim text-[10px]">MCP:</span>
                            {(JSON.parse(s.mcp_servers) as string[]).map((srv) => (
                              <span key={srv} className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">{srv}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()
          ) : (
            <div className="glass p-8 text-center">
              <p className="text-text-dim text-sm">No AI sessions recorded yet.</p>
              <p className="text-text-dim text-xs mt-2">
                Use <code className="text-brand font-mono">worktale session add</code> or enable the /worktale skill in Claude Code.
              </p>
            </div>
          )}
        </motion.div>
      )}

      {/* Models & Providers Tab */}
      {activeTab === "models" && stats && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-6">
          {/* Models */}
          <div className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Models Used</h3>
            {stats.models.length > 0 ? (
              <div className="space-y-3">
                {stats.models.map(([model, count]) => {
                  const pct = (count / stats.total_sessions) * 100;
                  return (
                    <div key={model} className="flex items-center gap-3">
                      <span className="text-text-primary text-sm font-mono flex-1 truncate">{model}</span>
                      <div className="w-32 h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-text-dim text-xs font-mono w-16 text-right">{count}x</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-text-dim text-sm">No model data.</p>
            )}
          </div>

          {/* Providers */}
          <div className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Providers</h3>
            {stats.providers.length > 0 ? (
              <div className="space-y-3">
                {stats.providers.map(([provider, count]) => {
                  const pct = (count / stats.total_sessions) * 100;
                  return (
                    <div key={provider} className="flex items-center gap-3">
                      <span className="text-text-primary text-sm font-mono flex-1">{provider}</span>
                      <div className="w-32 h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-text-dim text-xs font-mono w-16 text-right">{count}x</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-text-dim text-sm">No provider data.</p>
            )}
          </div>

          {/* Cost by model */}
          <div className="glass p-5 col-span-2">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Token Distribution</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-surface-2 rounded-lg p-4 text-center">
                <div className="text-positive font-bold font-mono text-xl">{formatNumber(stats.total_input_tokens)}</div>
                <div className="text-text-dim text-xs mt-1">Input Tokens</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-4 text-center">
                <div className="text-blue-400 font-bold font-mono text-xl">{formatNumber(stats.total_output_tokens)}</div>
                <div className="text-text-dim text-xs mt-1">Output Tokens</div>
              </div>
              <div className="bg-surface-2 rounded-lg p-4 text-center">
                <div className="text-text-primary font-bold font-mono text-xl">{formatNumber(totalTokens)}</div>
                <div className="text-text-dim text-xs mt-1">Total Tokens</div>
              </div>
            </div>
            {totalTokens > 0 && (
              <div className="mt-4 h-3 flex rounded-full overflow-hidden">
                <div
                  className="bg-positive"
                  style={{ width: `${(stats.total_input_tokens / totalTokens) * 100}%` }}
                  title={`Input: ${formatNumber(stats.total_input_tokens)}`}
                />
                <div
                  className="bg-blue-400"
                  style={{ width: `${(stats.total_output_tokens / totalTokens) * 100}%` }}
                  title={`Output: ${formatNumber(stats.total_output_tokens)}`}
                />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Agent Tools Tab */}
      {activeTab === "tools" && stats && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-6">
          {/* Agent tools frequency */}
          <div className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">Agent Tools Used</h3>
            {stats.tools_used_frequency.length > 0 ? (
              <div className="space-y-2">
                {stats.tools_used_frequency.map(([tool, count]) => {
                  const maxCount = stats.tools_used_frequency[0][1];
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={tool} className="flex items-center gap-3">
                      <span className="text-text-secondary text-xs font-mono w-24 truncate">{tool}</span>
                      <div className="flex-1 h-2.5 bg-surface-2 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-brand/60 to-brand rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-text-dim text-xs font-mono w-10 text-right">{count}x</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-text-dim text-sm">No agent tool data.</p>
            )}
          </div>

          {/* MCP servers */}
          <div className="glass p-5">
            <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-4">MCP Servers</h3>
            {stats.mcp_servers_used.length > 0 ? (
              <div className="space-y-2">
                {stats.mcp_servers_used.map(([srv, count]) => {
                  const maxCount = stats.mcp_servers_used[0][1];
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={srv} className="flex items-center gap-3">
                      <span className="text-text-secondary text-xs font-mono w-24 truncate">{srv}</span>
                      <div className="flex-1 h-2.5 bg-surface-2 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-purple-500/60 to-purple-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                      <span className="text-text-dim text-xs font-mono w-10 text-right">{count}x</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-text-dim text-sm">No MCP server data recorded.</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {(!stats || stats.total_sessions === 0) && (
        <div className="glass p-12 text-center space-y-4">
          <div className="text-4xl">&#129302;</div>
          <h3 className="text-text-primary font-bold text-lg">No AI Sessions Yet</h3>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            AI session tracking captures your usage of Claude Code, Codex, and Copilot — including tokens, cost, models, and tools used.
          </p>
          <div className="space-y-2 text-left max-w-sm mx-auto mt-4">
            <p className="text-text-dim text-xs font-semibold uppercase tracking-wider">Get started:</p>
            <div className="bg-surface-2 rounded-lg p-3">
              <code className="text-brand text-xs font-mono">worktale session add --provider anthropic --model claude-opus-4-6 --tool claude-code --note "your note"</code>
            </div>
            <p className="text-text-dim text-xs mt-2">Or enable the <code className="text-brand">/worktale</code> skill in Claude Code for automatic tracking.</p>
          </div>
        </div>
      )}
    </div>
  );
}
