import { motion } from "framer-motion";

interface StreakCounterProps {
  current: number;
  best: number;
}

export function StreakCounter({ current, best }: StreakCounterProps) {
  const maxVal = Math.max(current, best, 1);
  const currentPct = (current / maxVal) * 100;
  const bestPct = (best / maxVal) * 100;

  return (
    <div className="glass p-5 space-y-4">
      {/* Current streak */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg animate-pulse-glow">&#128293;</span>
            <span className="text-streak font-bold text-sm uppercase tracking-wider">Current Streak</span>
          </div>
          <span className="text-text-primary font-bold font-mono text-lg">
            {current} <span className="text-text-dim text-xs font-normal">day{current !== 1 ? "s" : ""}</span>
          </span>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${currentPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Best streak */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">&#128200;</span>
            <span className="text-text-secondary font-semibold text-sm uppercase tracking-wider">Best Streak</span>
          </div>
          <span className="text-text-primary font-bold font-mono text-lg">
            {best} <span className="text-text-dim text-xs font-normal">day{best !== 1 ? "s" : ""}</span>
          </span>
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${bestPct}%` }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
          />
        </div>
      </div>
    </div>
  );
}
