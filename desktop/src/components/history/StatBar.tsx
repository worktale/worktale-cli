import { motion } from "framer-motion";

interface StatBarProps {
  label: string;
  value: number;
  maxValue: number;
}

export function StatBar({ label, value, maxValue }: StatBarProps) {
  const ratio = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <div className="flex items-center gap-3">
      <span className="text-text-secondary text-xs font-mono w-28 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-brand/50 to-brand rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="text-text-dim text-xs font-mono w-10 text-right">{pct}%</span>
    </div>
  );
}
