import { describe, it, expect } from 'vitest';
import { classifyFilePath } from '../../src/utils/modules.js';

describe('classifyFilePath', () => {
  // --- src/ prefixed paths ---

  it('classifies src/api/routes/user.ts as src/api', () => {
    expect(classifyFilePath('src/api/routes/user.ts')).toBe('src/api');
  });

  it('classifies src/utils/formatting.ts as src/utils', () => {
    expect(classifyFilePath('src/utils/formatting.ts')).toBe('src/utils');
  });

  it('classifies src/db/index.ts as src/db', () => {
    expect(classifyFilePath('src/db/index.ts')).toBe('src/db');
  });

  it('classifies src/cli.ts as root (only one segment under src)', () => {
    // segments: ['src', 'cli.ts'] — length is 2, so returns src/cli.ts
    expect(classifyFilePath('src/cli.ts')).toBe('src/cli.ts');
  });

  // --- tests/ prefixed paths ---

  it('classifies tests/unit/auth.test.ts as tests', () => {
    expect(classifyFilePath('tests/unit/auth.test.ts')).toBe('tests');
  });

  it('classifies tests/integration/flow.test.ts as tests', () => {
    expect(classifyFilePath('tests/integration/flow.test.ts')).toBe('tests');
  });

  // --- docs/ prefixed paths ---

  it('classifies docs/README.md as docs', () => {
    expect(classifyFilePath('docs/README.md')).toBe('docs');
  });

  // --- .github/ prefixed paths ---

  it('classifies .github/workflows/ci.yml as .github', () => {
    expect(classifyFilePath('.github/workflows/ci.yml')).toBe('.github');
  });

  // --- root files ---

  it('classifies package.json as root (single segment)', () => {
    expect(classifyFilePath('package.json')).toBe('root');
  });

  it('classifies README.md as root', () => {
    expect(classifyFilePath('README.md')).toBe('root');
  });

  it('classifies tsconfig.json as root', () => {
    expect(classifyFilePath('tsconfig.json')).toBe('root');
  });

  // --- backslash handling ---

  it('normalizes backslashes to forward slashes', () => {
    expect(classifyFilePath('src\\api\\routes\\user.ts')).toBe('src/api');
  });

  it('handles mixed slashes', () => {
    expect(classifyFilePath('src/api\\routes/user.ts')).toBe('src/api');
  });

  // --- edge cases ---

  it('handles paths with leading slash', () => {
    // Segments after filtering empty: ['src', 'git', 'log.ts']
    expect(classifyFilePath('/src/git/log.ts')).toBe('src/git');
  });

  it('handles deeply nested paths', () => {
    expect(classifyFilePath('src/components/ui/buttons/primary.tsx')).toBe('src/components');
  });

  it('handles other top-level directories', () => {
    expect(classifyFilePath('lib/helpers/util.ts')).toBe('lib');
  });

  it('handles empty segments from double slashes', () => {
    // Double slashes produce empty segments which are filtered out
    expect(classifyFilePath('src//api//routes.ts')).toBe('src/api');
  });
});
