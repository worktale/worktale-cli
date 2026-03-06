import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Create a unique temp directory for each test run.
let tempHome: string;

// Mock os.homedir() so the config module uses our temp directory.
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => tempHome,
  };
});

import {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  loadRepoConfig,
  saveRepoConfig,
  ensureRepoWorktaleDir,
  getWorktaleDir,
  getConfigPath,
  DEFAULT_CONFIG,
  ensureWorktaleDir,
} from '../../src/config/index.js';
import type { GlobalConfig, RepoConfig } from '../../src/config/index.js';

describe('config', () => {
  beforeEach(() => {
    // Create a fresh temp directory for every test.
    tempHome = join(tmpdir(), `worktale-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempHome, { recursive: true });
  });

  afterEach(() => {
    // Clean up.
    rmSync(tempHome, { recursive: true, force: true });
  });

  // ---------- getWorktaleDir / getConfigPath ----------

  describe('getWorktaleDir / getConfigPath', () => {
    it('returns a path under the mocked home directory', () => {
      expect(getWorktaleDir()).toBe(join(tempHome, '.worktale'));
    });

    it('getConfigPath points to config.json inside .worktale', () => {
      expect(getConfigPath()).toBe(join(tempHome, '.worktale', 'config.json'));
    });
  });

  // ---------- ensureWorktaleDir ----------

  describe('ensureWorktaleDir', () => {
    it('creates the .worktale directory when it does not exist', () => {
      ensureWorktaleDir();
      expect(existsSync(join(tempHome, '.worktale'))).toBe(true);
    });

    it('is idempotent', () => {
      ensureWorktaleDir();
      ensureWorktaleDir(); // should not throw
      expect(existsSync(join(tempHome, '.worktale'))).toBe(true);
    });
  });

  // ---------- loadConfig ----------

  describe('loadConfig', () => {
    it('returns default config when no config file exists', () => {
      const config = loadConfig();
      expect(config.cloudEnabled).toBe(DEFAULT_CONFIG.cloudEnabled);
      expect(config.nudgeTime).toBe(DEFAULT_CONFIG.nudgeTime);
      expect(config.ai.provider).toBe(DEFAULT_CONFIG.ai.provider);
      expect(config.git.userEmail).toBe(DEFAULT_CONFIG.git.userEmail);
    });

    it('creates the config file on first load', () => {
      loadConfig();
      expect(existsSync(getConfigPath())).toBe(true);
    });

    it('reads config from disk when file exists', () => {
      ensureWorktaleDir();
      const custom: GlobalConfig = {
        ...DEFAULT_CONFIG,
        nudgeTime: '09:00',
        ai: { ...DEFAULT_CONFIG.ai, provider: 'openai' },
        git: { ...DEFAULT_CONFIG.git },
      };
      writeFileSync(getConfigPath(), JSON.stringify(custom, null, 2), 'utf-8');

      const loaded = loadConfig();
      expect(loaded.nudgeTime).toBe('09:00');
      expect(loaded.ai.provider).toBe('openai');
    });

    it('deep-merges with defaults (adds missing keys)', () => {
      ensureWorktaleDir();
      // Write a partial config – missing the `ai` section entirely.
      const partial = { nudgeTime: '08:00' };
      writeFileSync(getConfigPath(), JSON.stringify(partial, null, 2), 'utf-8');

      const loaded = loadConfig();
      expect(loaded.nudgeTime).toBe('08:00');
      // The `ai` section should come from defaults.
      expect(loaded.ai.provider).toBe(DEFAULT_CONFIG.ai.provider);
      expect(loaded.ai.ollamaUrl).toBe(DEFAULT_CONFIG.ai.ollamaUrl);
    });

    it('returns defaults when config file contains invalid JSON', () => {
      ensureWorktaleDir();
      writeFileSync(getConfigPath(), 'NOT VALID JSON!!', 'utf-8');

      const loaded = loadConfig();
      expect(loaded.nudgeTime).toBe(DEFAULT_CONFIG.nudgeTime);
    });
  });

  // ---------- saveConfig ----------

  describe('saveConfig', () => {
    it('writes config to disk as formatted JSON', () => {
      const config: GlobalConfig = {
        ...DEFAULT_CONFIG,
        nudgeTime: '21:00',
        ai: { ...DEFAULT_CONFIG.ai },
        git: { ...DEFAULT_CONFIG.git },
      };
      saveConfig(config);

      const raw = readFileSync(getConfigPath(), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.nudgeTime).toBe('21:00');
    });

    it('creates the .worktale directory if it does not exist', () => {
      saveConfig(DEFAULT_CONFIG);
      expect(existsSync(getConfigPath())).toBe(true);
    });
  });

  // ---------- getConfigValue ----------

  describe('getConfigValue', () => {
    it('returns top-level values', () => {
      saveConfig({ ...DEFAULT_CONFIG, nudgeTime: '10:00', ai: { ...DEFAULT_CONFIG.ai }, git: { ...DEFAULT_CONFIG.git } });
      expect(getConfigValue('nudgeTime')).toBe('10:00');
    });

    it('returns nested values with dot notation', () => {
      saveConfig({
        ...DEFAULT_CONFIG,
        ai: { provider: 'ollama', model: 'llama3', ollamaUrl: 'http://localhost:11434' },
        git: { ...DEFAULT_CONFIG.git },
      });
      expect(getConfigValue('ai.provider')).toBe('ollama');
      expect(getConfigValue('ai.model')).toBe('llama3');
    });

    it('returns undefined for non-existent keys', () => {
      loadConfig(); // ensure file
      expect(getConfigValue('nonexistent.deeply.nested')).toBeUndefined();
    });
  });

  // ---------- setConfigValue ----------

  describe('setConfigValue', () => {
    it('sets a top-level value', () => {
      loadConfig(); // seed the file
      setConfigValue('nudgeTime', '06:30');
      expect(getConfigValue('nudgeTime')).toBe('06:30');
    });

    it('sets a nested value with dot notation', () => {
      loadConfig();
      setConfigValue('ai.provider', 'anthropic');
      expect(getConfigValue('ai.provider')).toBe('anthropic');
    });

    it('persists non-default keys to disk even though loadConfig deep-merge drops them', () => {
      loadConfig();
      setConfigValue('brand.new.key', 'value');
      // loadConfig's deepMerge only keeps keys present in DEFAULT_CONFIG,
      // so getConfigValue (which calls loadConfig) will not find 'brand'.
      // But the value IS written to disk.
      const raw = readFileSync(getConfigPath(), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.brand.new.key).toBe('value');
    });

    it('persists to disk', () => {
      loadConfig();
      setConfigValue('colorScheme', 'dark');

      // Re-read from disk.
      const raw = readFileSync(getConfigPath(), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.colorScheme).toBe('dark');
    });
  });

  // ---------- loadRepoConfig ----------

  describe('loadRepoConfig', () => {
    it('returns null when no .worktale/config.json exists in the repo', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });
      expect(loadRepoConfig(repoDir)).toBeNull();
    });

    it('loads a valid repo config', () => {
      const repoDir = join(tempHome, 'my-repo');
      const worktaleDir = join(repoDir, '.worktale');
      mkdirSync(worktaleDir, { recursive: true });

      const config: RepoConfig = { repoId: 42, initialized: true, lastAnalysis: '2025-06-01T10:00:00Z' };
      writeFileSync(join(worktaleDir, 'config.json'), JSON.stringify(config), 'utf-8');

      const loaded = loadRepoConfig(repoDir);
      expect(loaded).toEqual(config);
    });

    it('returns null when config file is invalid JSON', () => {
      const repoDir = join(tempHome, 'my-repo');
      const worktaleDir = join(repoDir, '.worktale');
      mkdirSync(worktaleDir, { recursive: true });
      writeFileSync(join(worktaleDir, 'config.json'), '{{BAD}}', 'utf-8');

      expect(loadRepoConfig(repoDir)).toBeNull();
    });
  });

  // ---------- saveRepoConfig ----------

  describe('saveRepoConfig', () => {
    it('saves config into .worktale/config.json inside the repo', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });

      const config: RepoConfig = { repoId: 1, initialized: true, lastAnalysis: null };
      saveRepoConfig(repoDir, config);

      const raw = readFileSync(join(repoDir, '.worktale', 'config.json'), 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.repoId).toBe(1);
      expect(parsed.initialized).toBe(true);
    });

    it('creates .worktale dir if it does not exist', () => {
      const repoDir = join(tempHome, 'new-repo');
      mkdirSync(repoDir, { recursive: true });

      saveRepoConfig(repoDir, { repoId: 2, initialized: false, lastAnalysis: null });
      expect(existsSync(join(repoDir, '.worktale'))).toBe(true);
    });
  });

  // ---------- ensureRepoWorktaleDir ----------

  describe('ensureRepoWorktaleDir', () => {
    it('creates .worktale directory inside the repo', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });

      ensureRepoWorktaleDir(repoDir);
      expect(existsSync(join(repoDir, '.worktale'))).toBe(true);
    });

    it('creates .gitignore with .worktale/ entry when none exists', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });

      ensureRepoWorktaleDir(repoDir);

      const gitignore = readFileSync(join(repoDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.worktale/');
    });

    it('appends .worktale/ to existing .gitignore when entry is missing', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });
      writeFileSync(join(repoDir, '.gitignore'), 'node_modules/\n', 'utf-8');

      ensureRepoWorktaleDir(repoDir);

      const gitignore = readFileSync(join(repoDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('node_modules/');
      expect(gitignore).toContain('.worktale/');
    });

    it('does not duplicate .worktale/ if already present', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });
      writeFileSync(join(repoDir, '.gitignore'), '.worktale/\n', 'utf-8');

      ensureRepoWorktaleDir(repoDir);

      const gitignore = readFileSync(join(repoDir, '.gitignore'), 'utf-8');
      const matches = gitignore.match(/\.worktale\//g);
      expect(matches).toHaveLength(1);
    });

    it('handles .gitignore without trailing newline', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });
      writeFileSync(join(repoDir, '.gitignore'), 'node_modules/', 'utf-8'); // no trailing newline

      ensureRepoWorktaleDir(repoDir);

      const gitignore = readFileSync(join(repoDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.worktale/');
      // The original content should still be intact.
      expect(gitignore).toContain('node_modules/');
      // Entries should be on separate lines.
      const lines = gitignore.split('\n').filter(Boolean);
      expect(lines).toContain('node_modules/');
      expect(lines).toContain('.worktale/');
    });

    it('is idempotent', () => {
      const repoDir = join(tempHome, 'my-repo');
      mkdirSync(repoDir, { recursive: true });

      ensureRepoWorktaleDir(repoDir);
      ensureRepoWorktaleDir(repoDir);
      ensureRepoWorktaleDir(repoDir);

      const gitignore = readFileSync(join(repoDir, '.gitignore'), 'utf-8');
      const matches = gitignore.match(/\.worktale\//g);
      expect(matches).toHaveLength(1);
    });
  });
});
