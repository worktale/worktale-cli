import { useState, useEffect } from "react";
import * as api from "../../lib/api";
import type { GlobalConfig } from "../../lib/types";

interface SettingsProps {
  config: GlobalConfig | null;
  onRefresh: () => void;
}

interface SettingFieldProps {
  label: string;
  description: string;
  configKey: string;
  value: string;
  type?: "text" | "select" | "toggle";
  options?: { value: string; label: string }[];
  onSave: (key: string, value: string) => Promise<void>;
}

function SettingField({ label, description, configKey, value, type = "text", options, onSave }: SettingFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value); }, [value]);

  async function handleSave() {
    setSaving(true);
    await onSave(configKey, draft);
    setSaving(false);
    setEditing(false);
  }

  if (type === "toggle") {
    const isOn = value === "true";
    return (
      <div className="flex items-center justify-between py-3">
        <div>
          <div className="text-text-primary text-sm font-medium">{label}</div>
          <div className="text-text-dim text-xs">{description}</div>
        </div>
        <button
          onClick={() => onSave(configKey, isOn ? "false" : "true")}
          className={`w-10 h-5 rounded-full transition-all relative ${isOn ? "bg-brand" : "bg-surface-3"}`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${isOn ? "left-5" : "left-0.5"}`} />
        </button>
      </div>
    );
  }

  if (type === "select") {
    return (
      <div className="flex items-center justify-between py-3">
        <div>
          <div className="text-text-primary text-sm font-medium">{label}</div>
          <div className="text-text-dim text-xs">{description}</div>
        </div>
        <select
          value={value}
          onChange={(e) => onSave(configKey, e.target.value)}
          className="bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-text-primary text-sm font-mono focus:outline-none focus:border-brand/50 appearance-none cursor-pointer"
        >
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 mr-4">
        <div className="text-text-primary text-sm font-medium">{label}</div>
        <div className="text-text-dim text-xs">{description}</div>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="bg-surface-2 border border-border-active rounded-lg px-3 py-1.5 text-text-primary text-sm font-mono focus:outline-none w-48"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          />
          <button onClick={handleSave} disabled={saving} className="text-brand text-xs hover:text-brand/80">Save</button>
          <button onClick={() => setEditing(false)} className="text-text-dim text-xs hover:text-text-secondary">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-text-secondary font-mono text-sm hover:text-text-primary bg-surface-2 px-3 py-1.5 rounded-lg transition-colors"
        >
          {value || "--"}
        </button>
      )}
    </div>
  );
}

export function Settings({ config, onRefresh }: SettingsProps) {
  const [localConfig, setLocalConfig] = useState<GlobalConfig | null>(config);

  useEffect(() => { setLocalConfig(config); }, [config]);

  async function handleSave(key: string, value: string) {
    try {
      await api.setConfigValue(key, value);
      const newConfig = await api.getConfig();
      setLocalConfig(newConfig);
      onRefresh();
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  }

  if (!localConfig) return <div className="text-text-dim">Loading config...</div>;

  const sections = [
    {
      title: "AI Provider",
      icon: "&#9889;",
      fields: [
        {
          label: "Provider", description: "Digest generation engine", configKey: "ai.provider", value: localConfig.ai.provider,
          type: "select" as const, options: [{ value: "template", label: "Template" }, { value: "ollama", label: "Ollama" }],
        },
        { label: "Model", description: "Ollama model name", configKey: "ai.model", value: localConfig.ai.model ?? "" },
        { label: "Ollama URL", description: "Ollama API endpoint", configKey: "ai.ollamaUrl", value: localConfig.ai.ollamaUrl },
      ],
    },
    {
      title: "Git",
      icon: "&#128736;",
      fields: [
        { label: "User Email", description: "Git commit email", configKey: "git.userEmail", value: localConfig.git.userEmail ?? "" },
        { label: "Email Override", description: "Override email for filtering", configKey: "git.userEmailOverride", value: localConfig.git.userEmailOverride ?? "" },
      ],
    },
    {
      title: "Display",
      icon: "&#127912;",
      fields: [
        { label: "Nudge Time", description: "End-of-day reminder time", configKey: "nudgeTime", value: localConfig.nudgeTime },
        { label: "Timezone", description: "auto or IANA timezone", configKey: "timezone", value: localConfig.timezone },
        {
          label: "Capture Confirmation", description: "Show confirmation after git hook capture", configKey: "showCaptureConfirmation",
          value: String(localConfig.showCaptureConfirmation), type: "toggle" as const,
        },
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-text-primary">Settings</h2>

      {sections.map((section) => (
        <div key={section.title} className="glass p-5">
          <h3 className="text-text-secondary text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2">
            <span dangerouslySetInnerHTML={{ __html: section.icon }} />
            {section.title}
          </h3>
          <div className="divide-y divide-border">
            {section.fields.map((field) => (
              <SettingField key={field.configKey} {...field} onSave={handleSave} />
            ))}
          </div>
        </div>
      ))}

      <div className="text-text-dim text-xs">
        Config stored at <code className="text-brand font-mono">~/.worktale/config.json</code>
      </div>
    </div>
  );
}
