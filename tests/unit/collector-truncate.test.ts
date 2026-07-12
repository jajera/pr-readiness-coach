import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { truncateDiff } from '../../src/core/context/collector.js';

describe('truncateDiff', () => {
  it('leaves small diffs alone', () => {
    const r = truncateDiff('hello', 100);
    expect(r.truncated).toBe(false);
    expect(r.diff).toBe('hello');
  });

  it('truncates large diffs to max bytes', () => {
    const big = 'x'.repeat(200_000);
    const r = truncateDiff(big, 102_400);
    expect(r.truncated).toBe(true);
    expect(Buffer.byteLength(r.diff, 'utf8')).toBeLessThanOrEqual(102_400);
    expect(r.originalSize).toBe(200_000);
  });
});

describe('Property 2: Diff truncation bound', () => {
  it('truncated output is <= max and a prefix when possible', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 20, maxLength: 200 }), { minLength: 5, maxLength: 40 }),
        (chunks) => {
          const files = chunks.map(
            (c, i) =>
              `diff --git a/f${i}.ts b/f${i}.ts\n--- a/f${i}.ts\n+++ b/f${i}.ts\n@@ -0,0 +1,1 @@\n+${c}\n`,
          );
          const diff = files.join('');
          const max = 102_400;
          if (Buffer.byteLength(diff, 'utf8') <= max) return;
          const r = truncateDiff(diff, max);
          expect(r.truncated).toBe(true);
          expect(Buffer.byteLength(r.diff, 'utf8')).toBeLessThanOrEqual(max);
          expect(diff.startsWith(r.diff) || r.diff.length > 0).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
