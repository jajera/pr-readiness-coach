#!/usr/bin/env node
/**
 * Kiro Hook entry — warn-only readiness check.
 * Never blocks push; prints report/summary and always exits 0 for the hook contract.
 *
 * Env:
 * - PR_READY_HOOK_LOCAL: unset or not "0" → heuristic-only (default for pre-push)
 * - PR_READY_HOOK_TIMEOUT_MS: override ceiling (default 30000; manual full profile uses 120000)
 */
import {
  collectBranchContext,
  formatHumanReport,
  runHeuristicChecks,
  runPipeline,
} from '../core/index.js';

const HOOK_TIMEOUT_MS = Number(process.env.PR_READY_HOOK_TIMEOUT_MS ?? 30_000);

async function main(): Promise<void> {
  const timer = setTimeout(() => {
    console.error(
      `Analysis skipped (exceeded ${HOOK_TIMEOUT_MS}ms); push proceeding`,
    );
    process.exit(0);
  }, HOOK_TIMEOUT_MS);

  try {
    const localOnly = process.env.PR_READY_HOOK_LOCAL !== '0';
    const { context, configWarning } = await collectBranchContext(process.cwd());
    const heuristics = runHeuristicChecks(context);
    const result = await runPipeline(context, heuristics, {
      localOnly,
      configWarning,
    });
    const report = result.report;
    console.log(formatHumanReport(report, Boolean(process.stdout.isTTY)));
    if (report.verdict !== 'READY') {
      console.log('Hook is warn-only — push may proceed.');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Analysis skipped; push proceeding (${msg})`);
  } finally {
    clearTimeout(timer);
  }
  // Always allow push
  process.exit(0);
}

main();
