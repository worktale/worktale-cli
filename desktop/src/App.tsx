import { useState } from "react";
import { useWorktale } from "./hooks/useWorktale";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { StatusBar } from "./components/layout/StatusBar";
import { Overview } from "./components/dashboard/Overview";
import { DailyLog } from "./components/daily-log/DailyLog";
import { History } from "./components/history/History";
import { DigestEditor } from "./components/digest/DigestEditor";
import { AiView } from "./components/ai/AiView";
import { CloudPanel } from "./components/cloud/CloudPanel";
import { RepoManager } from "./components/repos/RepoManager";
import { Settings } from "./components/settings/Settings";
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { AnimatePresence, motion } from "framer-motion";

export default function App() {
  const {
    repos,
    activeRepo,
    streak,
    config,
    cloudConnected,
    view,
    setView,
    switchRepo,
    loading,
    error,
    refresh,
  } = useWorktale();

  // Counter to force Overview remount when navigating back to it
  const [refreshKey, setRefreshKey] = useState(0);

  function handleViewChange(newView: typeof view) {
    if (newView === "overview") {
      setRefreshKey((k) => k + 1);
    }
    setView(newView);
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="text-center animate-fadeIn">
          <div className="text-4xl mb-4">
            <span className="text-streak">&#9889;</span>
          </div>
          <h1 className="text-2xl font-bold text-brand mb-2">WORKTALE</h1>
          <p className="text-text-secondary text-sm">Loading your dev story...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="glass p-8 max-w-md text-center animate-fadeIn">
          <h2 className="text-negative font-bold text-lg mb-2">Error</h2>
          <p className="text-text-secondary text-sm mb-4">{error}</p>
          <p className="text-text-dim text-xs">
            Run <code className="text-brand">worktale init</code> in a git
            repository to get started.
          </p>
        </div>
      </div>
    );
  }

  if (!activeRepo) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="glass p-8 max-w-md text-center animate-fadeIn">
          <div className="text-4xl mb-4">
            <span className="text-streak">&#9889;</span>
          </div>
          <h2 className="text-text-primary font-bold text-lg mb-2">
            No Repositories Found
          </h2>
          <p className="text-text-secondary text-sm mb-4">
            Initialize a repository with the CLI first:
          </p>
          <code className="text-brand bg-surface-2 px-3 py-1.5 rounded-lg text-sm font-mono">
            worktale init
          </code>
        </div>
      </div>
    );
  }

  function renderView() {
    if (!activeRepo) return null;
    switch (view) {
      case "overview":
        return <Overview key={refreshKey} repoId={activeRepo.id} />;
      case "daily-log":
        return <DailyLog repoId={activeRepo.id} />;
      case "history":
        return <History repoId={activeRepo.id} />;
      case "digest":
        return <DigestEditor repoId={activeRepo.id} />;
      case "ai":
        return <AiView repoId={activeRepo.id} />;
      case "cloud":
        return <CloudPanel repoId={activeRepo.id} onRefresh={refresh} />;
      case "repos":
        return (
          <RepoManager
            repos={repos}
            activeRepo={activeRepo}
            onSwitch={switchRepo}
            onRefresh={refresh}
          />
        );
      case "settings":
        return <Settings config={config} onRefresh={refresh} />;
      default:
        return <Overview key={refreshKey} repoId={activeRepo.id} />;
    }
  }

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      <div className="flex-1 flex min-h-0">
        <Sidebar view={view} onViewChange={handleViewChange} />

        <div className="flex-1 flex flex-col min-w-0">
          <Header
            repo={activeRepo}
            repos={repos}
            streak={streak}
            cloudConnected={cloudConnected}
            onSwitchRepo={switchRepo}
            view={view}
          />

          <main className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="h-full"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <StatusBar config={config} cloudConnected={cloudConnected} />

      <CommandPalette
        onNavigate={handleViewChange}
        repoId={activeRepo.id}
        cloudConnected={cloudConnected}
      />
    </div>
  );
}
