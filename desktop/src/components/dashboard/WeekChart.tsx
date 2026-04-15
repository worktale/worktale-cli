import { motion } from "framer-motion";
import { formatNumber } from "../../lib/utils";

interface WeekChartDay {
  day: string;
  value: number;
  isToday: boolean;
}

interface WeekChartProps {
  data: WeekChartDay[];
}

export function WeekChart({ data }: WeekChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((entry, i) => {
        const pct = (entry.value / maxValue) * 100;
        const hasValue = entry.value > 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className={`text-xs font-mono w-8 ${entry.isToday ? "text-text-primary font-bold" : "text-text-secondary"}`}>
              {entry.day}
            </span>
            <div className="flex-1 h-5 bg-surface-2 rounded-sm overflow-hidden relative">
              <motion.div
                className={`h-full rounded-sm ${hasValue ? "bg-gradient-to-r from-brand/60 to-brand" : ""}`}
                initial={{ width: 0 }}
                animate={{ width: hasValue ? `${Math.max(pct, 2)}%` : "0%" }}
                transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.05 }}
              />
            </div>
            <span className="text-text-secondary text-xs font-mono w-20 text-right">
              {hasValue ? `${formatNumber(entry.value)} lines` : ""}
            </span>
            {entry.isToday && <span className="text-streak text-xs">&#8592; today</span>}
          </div>
        );
      })}
    </div>
  );
}
