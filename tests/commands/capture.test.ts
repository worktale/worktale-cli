import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock DB
vi.mock('../../src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock captureLatestCommit
const mockCaptureLatestCommit = vi.fn();
vi.mock('../../src/git/capture.js', () => ({
  captureLatestCommit: (...args: any[]) => mockCaptureLatestCommit(...args),
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Import after mocks
import { captureCommand } from '../../src/commands/capture.js';

describe('captureCommand', () => {
  beforeEach(() => {
    mockCaptureLatestCommit.mockReset();
    mockExit.mockClear();
  });

  it('calls captureLatestCommit with cwd and silent=false by default', async () => {
    mockCaptureLatestCommit.mockResolvedValue(undefined);

    await captureCommand();

    expect(mockCaptureLatestCommit).toHaveBeenCalledWith(process.cwd(), false);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('calls captureLatestCommit with silent=true when option is set', async () => {
    mockCaptureLatestCommit.mockResolvedValue(undefined);

    await captureCommand({ silent: true });

    expect(mockCaptureLatestCommit).toHaveBeenCalledWith(process.cwd(), true);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('handles errors gracefully (exits 0, never crashes)', async () => {
    mockCaptureLatestCommit.mockRejectedValue(new Error('git error'));

    await captureCommand();

    // The capture command must NEVER fail - always exit 0
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('does not produce error output on failure', async () => {
    const output: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => output.push(args.join(' '));

    mockCaptureLatestCommit.mockRejectedValue(new Error('network error'));

    await captureCommand();

    console.error = originalError;

    // The capture command must be completely silent on errors
    expect(output).toHaveLength(0);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('handles silent=false explicitly', async () => {
    mockCaptureLatestCommit.mockResolvedValue(undefined);

    await captureCommand({ silent: false });

    expect(mockCaptureLatestCommit).toHaveBeenCalledWith(process.cwd(), false);
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
