import { formatRelativeTime } from "../../lib/utils";
import type { Commit } from "../../lib/types";

interface CommitTimelineProps {
  commits: Commit[];
  maxItems?: number;
}

export function CommitTimeline({ commits, maxItems }: CommitTimelineProps) {
  const items = maxItems ? commits.slice(0, maxItems) : commits;

  if (items.length === 0) {
    return (
      <div className="text-text-dim text-sm py-4 text-center">
        No commits to show.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {items.map((commit, i) => {
        const msg = commit.message ?? "(no message)";
        const truncated = msg.length > 72 ? msg.slice(0, 69) + "..." : msg;
        const timeStr = formatRelativeTime(commit.timestamp);

        return (
          <div
            key={commit.sha || i}
            className="flex items-start gap-3 py-1.5 px-2 rounded-md hover:bg-surface-2 transition-colors group"
          >
            {/* Timeline dot */}
            <div className="flex-shrink-0 mt-1.5">
              <div className="w-2 h-2 rounded-full bg-brand/60 group-hover:bg-brand transition-colors" />
            </div>

            {/* Time */}
            <span className="text-text-dim text-xs font-mono w-16 flex-shrink-0 mt-0.5">
              {timeStr}
            </span>

            {/* Message */}
            <span className="text-text-primary text-sm flex-1 leading-snug">{truncated}</span>

            {/* Stats (compact) */}
            {(commit.lines_added > 0 || commit.lines_removed > 0) && (
              <span className="text-xs font-mono flex-shrink-0 mt-0.5">
                <span className="text-positive">+{commit.lines_added}</span>
                <span className="text-text-dim mx-0.5">/</span>
                <span className="text-negative">-{commit.lines_removed}</span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
