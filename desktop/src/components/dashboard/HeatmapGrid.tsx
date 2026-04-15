import { useState, useMemo } from "react";
import { getHeatColor, getHeatLevel } from "../../lib/theme";
import { getDateString } from "../../lib/utils";

interface HeatmapGridProps {
  data: Map<string, number>;
}

function isoRow(jsDow: number): number {
  return jsDow === 0 ? 6 : jsDow - 1;
}

export function HeatmapGrid({ data }: HeatmapGridProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; count: number } | null>(null);

  const { grid, monthLabels, totalWeeks } = useMemo(() => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRow = isoRow(today.getDay());
    const thisMon = new Date(today);
    thisMon.setDate(thisMon.getDate() - todayRow);

    const startMon = new Date(thisMon);
    startMon.setDate(startMon.getDate() - 52 * 7);

    const totalWeeks = 53;
    const grid: { count: number; date: string; future: boolean }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: totalWeeks }, () => ({ count: 0, date: "", future: true })),
    );

    const monthLabels: { week: number; label: string }[] = [];

    for (let week = 0; week < totalWeeks; week++) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(startMon);
        d.setDate(d.getDate() + week * 7 + row);

        if (d > today) continue;

        const dateStr = getDateString(d);
        const count = data.get(dateStr) ?? 0;
        grid[row][week] = { count, date: dateStr, future: false };

        if (row === 0) {
          const m = d.getMonth();
          if (week === 0) {
            monthLabels.push({ week, label: monthNames[m] });
          } else {
            const prevMon = new Date(startMon);
            prevMon.setDate(prevMon.getDate() + (week - 1) * 7);
            if (prevMon.getMonth() !== m) {
              monthLabels.push({ week, label: monthNames[m] });
            }
          }
        }
      }
    }

    return { grid, monthLabels, totalWeeks };
  }, [data]);

  const cellSize = 13;
  const cellGap = 3;
  const labelWidth = 28;
  const headerHeight = 18;
  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

  return (
    <div className="relative">
      <svg
        width={labelWidth + totalWeeks * (cellSize + cellGap)}
        height={headerHeight + 7 * (cellSize + cellGap)}
        className="overflow-visible"
      >
        {/* Month labels */}
        {monthLabels.map(({ week, label }) => (
          <text
            key={`month-${week}`}
            x={labelWidth + week * (cellSize + cellGap)}
            y={12}
            className="fill-text-dim text-[10px]"
          >
            {label}
          </text>
        ))}

        {/* Day labels */}
        {dayLabels.map((label, row) =>
          label ? (
            <text
              key={`day-${row}`}
              x={0}
              y={headerHeight + row * (cellSize + cellGap) + cellSize - 2}
              className="fill-text-dim text-[10px]"
            >
              {label}
            </text>
          ) : null,
        )}

        {/* Grid cells */}
        {grid.map((row, rowIdx) =>
          row.map((cell, weekIdx) =>
            cell.future ? null : (
              <rect
                key={`${rowIdx}-${weekIdx}`}
                x={labelWidth + weekIdx * (cellSize + cellGap)}
                y={headerHeight + rowIdx * (cellSize + cellGap)}
                width={cellSize}
                height={cellSize}
                rx={2}
                fill={getHeatColor(getHeatLevel(cell.count))}
                className="transition-all duration-150 hover:brightness-125 cursor-pointer"
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top - 8, date: cell.date, count: cell.count });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ),
          ),
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-text-dim text-[10px]">Less</span>
        {([0, 1, 2, 3] as const).map((level) => (
          <div
            key={level}
            className="w-3 h-3 rounded-[2px]"
            style={{ background: getHeatColor(level) }}
          />
        ))}
        <span className="text-text-dim text-[10px]">More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 glass px-3 py-1.5 text-xs pointer-events-none shadow-xl"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <span className="text-text-primary font-bold">{tooltip.count}</span>
          <span className="text-text-secondary ml-1">commit{tooltip.count !== 1 ? "s" : ""} on</span>
          <span className="text-text-primary ml-1">{tooltip.date}</span>
        </div>
      )}
    </div>
  );
}
