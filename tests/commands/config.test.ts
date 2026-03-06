import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock DB (config command uses closeDb)
vi.mock('../../src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock config functions
const mockLoadConfig = vi.fn();
const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();
const mockGetConfigPath = vi.fn();

vi.mock('../../src/config/index.js', () => ({
  loadConfig: () => mockLoadConfig(),
  getConfigValue: (key: string) => mockGetConfigValue(key),
  setConfigValue: (key: string, value: unknown) => mockSetConfigValue(key, value),
  getConfigPath: () => mockGetConfigPath(),
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Import after mocks
import { configCommand } from '../../src/commands/config.js';

describe('configCommand', () => {
  let output: string[] = [];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    mockExit.mockClear();
    mockLoadConfig.mockReset();
    mockGetConfigValue.mockReset();
    mockSetConfigValue.mockReset();
    mockGetConfigPath.mockReset();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('shows full config when no action is provided', async () => {
    mockLoadConfig.mockReturnValue({
      cloudEnabled: false,
      nudgeTime: '17:00',
      ai: { provider: 'template', model: null },
      git: { userEmail: 'test@example.com' },
    });
    mockGetConfigPath.mockReturnValue('/home/user/.worktale/config.json');

    await configCommand();

    const joined = output.join('\n');
    expect(joined).toContain('WORKTALE CONFIG');
    expect(joined).toContain('cloudEnabled');
    expect(joined).toContain('/home/user/.worktale/config.json');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('gets a specific key value', async () => {
    mockGetConfigValue.mockReturnValue('template');

    await configCommand('get', 'ai.provider');

    const joined = output.join('\n');
    expect(joined).toContain('template');
    expect(mockGetConfigValue).toHaveBeenCalledWith('ai.provider');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows "(not set)" for undefined key', async () => {
    mockGetConfigValue.mockReturnValue(undefined);

    await configCommand('get', 'nonexistent.key');

    const joined = output.join('\n');
    expect(joined).toContain('(not set)');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows nested object for object value', async () => {
    mockGetConfigValue.mockReturnValue({ provider: 'ollama', model: 'llama3' });

    await configCommand('get', 'ai');

    const joined = output.join('\n');
    expect(joined).toContain('provider');
    expect(joined).toContain('model');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows error when get has no key', async () => {
    await configCommand('get');

    const joined = output.join('\n');
    expect(joined).toContain('Usage');
    expect(joined).toContain('worktale config get');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('sets a value and confirms', async () => {
    await configCommand('set', 'ai.provider', 'ollama');

    expect(mockSetConfigValue).toHaveBeenCalledWith('ai.provider', 'ollama');
    const joined = output.join('\n');
    expect(joined).toContain('ai.provider');
    expect(joined).toContain('ollama');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('parses boolean "true" when setting', async () => {
    await configCommand('set', 'cloudEnabled', 'true');

    expect(mockSetConfigValue).toHaveBeenCalledWith('cloudEnabled', true);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('parses boolean "false" when setting', async () => {
    await configCommand('set', 'cloudEnabled', 'false');

    expect(mockSetConfigValue).toHaveBeenCalledWith('cloudEnabled', false);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('parses numeric values when setting', async () => {
    await configCommand('set', 'someKey', '42');

    expect(mockSetConfigValue).toHaveBeenCalledWith('someKey', 42);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows error when set has no key or value', async () => {
    await configCommand('set');

    const joined = output.join('\n');
    expect(joined).toContain('Usage');
    expect(joined).toContain('worktale config set');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('shows config path', async () => {
    mockGetConfigPath.mockReturnValue('/home/user/.worktale/config.json');

    await configCommand('path');

    const joined = output.join('\n');
    expect(joined).toContain('/home/user/.worktale/config.json');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('shows error for unknown action', async () => {
    await configCommand('banana');

    const joined = output.join('\n');
    expect(joined).toContain('Unknown config action');
    expect(joined).toContain('banana');
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
