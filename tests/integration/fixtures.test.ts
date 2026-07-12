import { describe, expect, it } from 'vitest';
import { collectFixtureContext } from '../../src/core/context/collector.js';
import { runHeuristicChecks } from '../../src/core/heuristics/checker.js';
import { buildReport } from '../../src/core/report/builder.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('fixtures', () => {
  it('not-ready is NOT READY with blockers', async () => {
    const { context, configWarning } = await collectFixtureContext(
      path.join(root, 'fixtures/demo-app/not-ready'),
    );
    const heuristics = runHeuristicChecks(context);
    const report = buildReport({ context, heuristics, configWarning });
    expect(report.verdict).toBe('NOT READY');
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it('ready is READY with zero blockers/warnings', async () => {
    const { context, configWarning } = await collectFixtureContext(
      path.join(root, 'fixtures/demo-app/ready'),
    );
    const heuristics = runHeuristicChecks(context);
    const report = buildReport({ context, heuristics, configWarning });
    expect(report.blockers).toEqual([]);
    // config warnings from parent ready.yml should not appear if valid
    const nonConfig = report.warnings.filter((w) => w.category !== 'config');
    expect(nonConfig).toEqual([]);
    expect(report.verdict === 'READY' || report.verdict === 'READY WITH WARNINGS').toBe(true);
    if (report.warnings.length === 0) {
      expect(report.verdict).toBe('READY');
    }
  });
});
