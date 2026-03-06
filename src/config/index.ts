import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface GlobalConfig {
  cloudEnabled: boolean;
  cloudToken: string | null;
  nudgeTime: string;
  timezone: string;
  colorScheme: string;
  ai: {
    provider: string;
    model: string | null;
    ollamaUrl: string;
  };
  git: {
    userEmail: string | null;
    userEmailOverride: string | null;
  };
  showCaptureConfirmation: boolean;
}

export interface RepoConfig {
  repoId: number;
  initialized: boolean;
  lastAnalysis: string | null;
}

export const DEFAULT_CONFIG: GlobalConfig = {
  cloudEnabled: false,
  cloudToken: null,
  nudgeTime: '17:00',
  timezone: 'auto',
  colorScheme: 'default',
  ai: {
    provider: 'template',
    model: null,
    ollamaUrl: 'http://localhost:11434',
  },
  git: {
    userEmail: null,
    userEmailOverride: null,
  },
  showCaptureConfirmation: false,
};

export function getWorktaleDir(): string {
  return join(homedir(), '.worktale');
}

export function ensureWorktaleDir(): void {
  const dir = getWorktaleDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getConfigPath(): string {
  return join(getWorktaleDir(), 'config.json');
}

function deepMerge(defaults: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in overrides) {
      const defaultVal = defaults[key];
      const overrideVal = overrides[key];
      if (
        defaultVal !== null &&
        overrideVal !== null &&
        typeof defaultVal === 'object' &&
        typeof overrideVal === 'object' &&
        !Array.isArray(defaultVal)
      ) {
        result[key] = deepMerge(
          defaultVal as Record<string, unknown>,
          overrideVal as Record<string, unknown>,
        );
      } else {
        result[key] = overrideVal;
      }
    }
  }
  return result;
}

export function loadConfig(): GlobalConfig {
  ensureWorktaleDir();
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai }, git: { ...DEFAULT_CONFIG.git } };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      parsed,
    ) as unknown as GlobalConfig;
  } catch {
    return { ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai }, git: { ...DEFAULT_CONFIG.git } };
  }
}

export function saveConfig(config: GlobalConfig): void {
  ensureWorktaleDir();
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function getNestedValue(obj: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

export function getConfigValue(key: string): unknown {
  const config = loadConfig();
  const keys = key.split('.');
  return getNestedValue(config as unknown as Record<string, unknown>, keys);
}

export function setConfigValue(key: string, value: unknown): void {
  const config = loadConfig();
  const keys = key.split('.');
  setNestedValue(config as unknown as Record<string, unknown>, keys, value);
  saveConfig(config);
}

export function loadRepoConfig(repoPath: string): RepoConfig | null {
  const configPath = join(repoPath, '.worktale', 'config.json');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as RepoConfig;
  } catch {
    return null;
  }
}

export function saveRepoConfig(repoPath: string, config: RepoConfig): void {
  ensureRepoWorktaleDir(repoPath);
  const configPath = join(repoPath, '.worktale', 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function ensureRepoWorktaleDir(repoPath: string): void {
  const worktaleDir = join(repoPath, '.worktale');

  if (!existsSync(worktaleDir)) {
    mkdirSync(worktaleDir, { recursive: true });
  }

  const gitignorePath = join(repoPath, '.gitignore');
  const entry = '.worktale/';

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (!content.split('\n').some((line) => line.trim() === entry)) {
      const suffix = content.endsWith('\n') ? '' : '\n';
      appendFileSync(gitignorePath, `${suffix}${entry}\n`, 'utf-8');
    }
  } else {
    writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
  }
}
