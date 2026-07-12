import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseReadyConfig, DEFAULT_READY_CONFIG } from '../../src/core/context/ready-config.js';

describe('parseReadyConfig', () => {
  it('returns defaults for empty string', () => {
    const r = parseReadyConfig('');
    expect(r.config.maxDiffSizeBytes).toBe(DEFAULT_READY_CONFIG.maxDiffSizeBytes);
    expect(r.warning).toBeUndefined();
  });

  it('parses valid yaml', () => {
    const r = parseReadyConfig(`
testFilePatterns:
  - "**/*.test.ts"
maxDiffSizeBytes: 2048
docsPathAllowlist:
  - "docs/**"
customBlockers:
  - pattern: "HACK"
    severity: blocker
`);
    expect(r.warning).toBeUndefined();
    expect(r.config.maxDiffSizeBytes).toBe(2048);
    expect(r.config.docsPathAllowlist).toEqual(['docs/**']);
    expect(r.config.customBlockers).toHaveLength(1);
  });

  it('falls back on invalid yaml', () => {
    const r = parseReadyConfig('{ not: valid: yaml');
    expect(r.warning).toMatch(/Failed to parse/);
    expect(r.config.maxDiffSizeBytes).toBe(DEFAULT_READY_CONFIG.maxDiffSizeBytes);
  });

  it('falls back on out-of-range maxDiffSizeBytes', () => {
    const r = parseReadyConfig('maxDiffSizeBytes: 10');
    expect(r.warning).toMatch(/out of range/);
  });
});

describe('Property 1: Invalid config falls back', () => {
  it('never throws and surfaces warning or defaults', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = parseReadyConfig(s);
        expect(r.config).toBeDefined();
        expect(r.config.maxDiffSizeBytes).toBeGreaterThanOrEqual(1024);
        expect((r.config.customBlockers ?? []).length).toBeLessThanOrEqual(20);
      }),
      { numRuns: 100 },
    );
  });
});
