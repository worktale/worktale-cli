import type { View } from "../../lib/types";

interface SidebarProps {
  view: View;
  onViewChange: (view: View) => void;
}

const navItems: { view: View; icon: string; label: string; shortcut: string }[] = [
  { view: "overview", icon: "chart", label: "Dashboard", shortcut: "^1" },
  { view: "daily-log", icon: "calendar", label: "Daily Log", shortcut: "^2" },
  { view: "history", icon: "clock", label: "History", shortcut: "^3" },
  { view: "digest", icon: "edit", label: "Digest", shortcut: "^4" },
  { view: "ai", icon: "bot", label: "AI Sessions", shortcut: "^5" },
  { view: "cloud", icon: "cloud", label: "Cloud", shortcut: "^6" },
  { view: "repos", icon: "folder", label: "Repos", shortcut: "^7" },
  { view: "settings", icon: "gear", label: "Settings", shortcut: "^8" },
];

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const color = active ? "#4ADE80" : "#6B7280";
  const props = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (type) {
    case "chart":
      return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case "calendar":
      return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "clock":
      return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "edit":
      return <svg {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case "bot":
      return <svg {...props}><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/><circle cx="8" cy="16" r="1" fill={color}/><circle cx="16" cy="16" r="1" fill={color}/></svg>;
    case "cloud":
      return <svg {...props}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>;
    case "folder":
      return <svg {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
    case "gear":
      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    default:
      return null;
  }
}

export function Sidebar({ view, onViewChange }: SidebarProps) {
  return (
    <nav className="w-16 h-full flex flex-col border-r border-border bg-surface py-4 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center mb-6">
        <span className="text-streak text-xl">&#9889;</span>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive = view === item.view;
          return (
            <div key={item.view} className="relative group">
              <button
                onClick={() => onViewChange(item.view)}
                className={`
                  w-full flex items-center justify-center p-2.5 rounded-lg transition-all duration-150
                  ${isActive
                    ? "bg-brand/10 text-brand"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                  }
                `}
              >
                <NavIcon type={item.icon} active={isActive} />
              </button>
              {/* Tooltip */}
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-[#1a1a24] border border-white/10 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl shadow-black/50">
                <span className="text-text-primary font-medium">{item.label}</span>
                <span className="text-text-dim ml-2">{item.shortcut}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom: Command palette */}
      <div className="px-2 relative group">
        <button
          onClick={() => document.dispatchEvent(new CustomEvent("toggle-command-palette"))}
          className="w-full flex items-center justify-center p-2.5 rounded-lg text-text-dim hover:text-text-secondary hover:bg-surface-2 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 bg-[#1a1a24] border border-white/10 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-xl shadow-black/50">
          <span className="text-text-primary font-medium">Commands</span>
          <span className="text-text-dim ml-2">^K</span>
        </div>
      </div>
    </nav>
  );
}
