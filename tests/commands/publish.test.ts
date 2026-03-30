import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock DB
vi.mock('../../src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
}));

// Mock catchup banner (depends on DB + cloud)
vi.mock('../../src/utils/catchup-banner.js', () => ({
  showCatchupBanner: vi.fn(),
}));

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

// Import after mocks
import { publishCommand } from '../../src/commands/publish.js';

describe('publishCommand', () => {
  let output: string[] = [];
  const originalLog = console.log;

  beforeEach(() => {
    output = [];
    console.log = (...args: any[]) => output.push(args.join(' '));
    mockExit.mockClear();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('shows upsell when not cloud-configured', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('WORKTALE CLOUD');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('mentions developer portfolio feature', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('developer portfolio');
  });

  it('mentions AI weekly digests', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('AI weekly digests');
  });

  it('shows worktale.dev/{you} profile link', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('worktale.dev/{you}');
  });

  it('mentions cloud signup', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('worktale cloud signup');
  });

  it('displays the WORKTALE heading', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('WORKTALE');
  });
});
