import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock DB
vi.mock('../../src/db/index.js', () => ({
  getDb: vi.fn(),
  closeDb: vi.fn(),
  getDbPath: () => ':memory:',
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

  it('shows "coming soon" upsell message', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('coming soon');
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

  it('mentions worktale.dev profile link', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('worktale.dev/you');
  });

  it('mentions early access signup', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('early access');
    expect(joined).toContain('worktale.dev');
  });

  it('displays the Publish heading', async () => {
    await publishCommand();

    const joined = output.join('\n');
    expect(joined).toContain('Publish');
    expect(joined).toContain('WORKTALE');
  });
});
