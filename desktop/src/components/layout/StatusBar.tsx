import { useState, useEffect } from "react";
import * as api from "../../lib/api";
import type { GlobalConfig, CloudProfile } from "../../lib/types";

interface StatusBarProps {
  config: GlobalConfig | null;
  cloudConnected: boolean;
}

export function StatusBar({ config, cloudConnected }: StatusBarProps) {
  const [profile, setProfile] = useState<CloudProfile | null>(null);

  useEffect(() => {
    if (cloudConnected) {
      api.cloudGetProfile().then(setProfile).catch(() => {});
    } else {
      setProfile(null);
    }
  }, [cloudConnected]);

  const aiProvider = config?.ai?.provider ?? "template";
  const aiModel = config?.ai?.model;
  const aiLabel = aiProvider === "ollama" && aiModel ? `Ollama (${aiModel})` : aiProvider === "ollama" ? "Ollama" : "Template";

  return (
    <footer className="h-7 flex items-center justify-between px-4 border-t border-border bg-surface text-[11px] text-text-dim flex-shrink-0 select-none">
      {/* Left */}
      <div className="flex items-center gap-4">
        <span className="text-brand font-semibold tracking-wider">WORKTALE</span>
        <span>v0.1.0</span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {/* AI model */}
        <div className="flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span>{aiLabel}</span>
        </div>

        {/* Cloud status */}
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${cloudConnected ? "bg-positive" : "bg-text-dim"}`} />
          <span>{cloudConnected ? "Cloud Connected" : "Offline"}</span>
        </div>

        {/* Username & plan */}
        {profile && (
          <div className="flex items-center gap-1.5">
            <span className="text-text-secondary">@{profile.username}</span>
            <span className={profile.subscriptionTier === "pro" ? "text-streak font-semibold" : ""}>
              {profile.subscriptionTier === "pro" ? "Pro" : "Free"}
            </span>
          </div>
        )}
      </div>
    </footer>
  );
}
