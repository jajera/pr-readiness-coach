import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import {
  CoachError,
  collectBranchContext,
  collectFixtureContext,
  exitCodeForReport,
  formatHumanReport,
  formatJsonReport,
  runHeuristicChecks,
  runPipeline,
  type ContextPayload,
  type ReadinessReport,
} from '../core/index.js';

export interface CliOptions {
  json?: boolean;
  local?: boolean;
  path?: string;
  api?: boolean;
  apiUrl?: string;
  apiKey?: string;
  applyDraft?: boolean;
  draftBase?: string;
}

async function postToApi(
  context: ContextPayload,
  apiUrl: string,
  apiKey: string,
): Promise<ReadinessReport> {
  const url = apiUrl.replace(/\/$/, '') + '/analyze';
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(context),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CoachError('API_TRANSPORT', `Unable to reach API: ${msg}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new CoachError(
      'API_ERROR',
      `API failure (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as ReadinessReport;
}

function applyDraftPr(report: ReadinessReport, base: string): void {
  const title = report.draftPrTitle?.trim();
  const body = report.draftPrBody?.trim();
  if (!title || !body) {
    throw new CoachError(
      'USAGE',
      '--apply-draft requires a full-mode report with draftPrTitle and draftPrBody (run without --local)',
    );
  }
  const which = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  if (which.status !== 0) {
    throw new CoachError('USAGE', '--apply-draft requires the GitHub CLI (gh) on PATH');
  }
  const result = spawnSync(
    'gh',
    ['pr', 'create', '--title', title, '--body', body, '--base', base],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || 'gh pr create failed').trim();
    throw new CoachError('USAGE', `gh pr create failed: ${err.slice(0, 400)}`);
  }
  const out = (result.stdout || '').trim();
  if (out) console.error(out);
}

export async function executeAnalysis(opts: CliOptions): Promise<{
  report: ReadinessReport;
  exitCode: number;
}> {
  if (opts.api && opts.local) {
    throw new CoachError('USAGE', 'Invalid combination: --api and --local');
  }
  if (opts.applyDraft && opts.path) {
    throw new CoachError('USAGE', 'Invalid combination: --apply-draft and --path');
  }

  const collected = opts.path
    ? await collectFixtureContext(opts.path)
    : await collectBranchContext(process.cwd());

  const { context, configWarning } = collected;
  const heuristics = runHeuristicChecks(context);

  let report: ReadinessReport;

  if (opts.api) {
    const apiUrl = opts.apiUrl ?? process.env.PR_READY_API_URL;
    const apiKey = opts.apiKey ?? process.env.PR_READY_API_KEY;
    if (!apiUrl || !apiKey) {
      throw new CoachError(
        'USAGE',
        'API mode requires --api-url / PR_READY_API_URL and --api-key / PR_READY_API_KEY',
      );
    }
    report = await postToApi(context, apiUrl, apiKey);
  } else {
    const result = await runPipeline(context, heuristics, {
      localOnly: Boolean(opts.local),
      configWarning,
    });
    report = result.report;
  }

  return { report, exitCode: exitCodeForReport(report) };
}

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name('pr-ready')
    .description('Evaluate whether a Git branch is ready to open a pull request')
    .version('1.0.0')
    .option('--json', 'Emit JSON Readiness_Report on stdout')
    .option('--local', 'Heuristic-only (no Bedrock)')
    .option('--path <dir>', 'Fixture/directory mode (no git)')
    .option('--api', 'POST context to deployed API')
    .option('--api-url <url>', 'API base URL')
    .option('--api-key <key>', 'API key (or PR_READY_API_KEY)')
    .option(
      '--apply-draft',
      'After analysis, create a GitHub PR with gh using draft title/body (user-triggered)',
    )
    .option('--draft-base <branch>', 'Base branch for --apply-draft', 'main')
    .allowExcessArguments(false)
    .showHelpAfterError();

  try {
    program.parse(argv);
  } catch {
    process.exit(2);
  }

  const opts = program.opts<CliOptions>();

  try {
    const { report, exitCode } = await executeAnalysis(opts);
    if (opts.json) {
      process.stdout.write(formatJsonReport(report) + '\n');
    } else {
      const useColor = Boolean(process.stdout.isTTY);
      process.stdout.write(formatHumanReport(report, useColor) + '\n');
    }
    if (opts.applyDraft) {
      applyDraftPr(report, opts.draftBase ?? 'main');
    }
    process.exitCode = exitCode;
  } catch (err) {
    if (err instanceof CoachError) {
      console.error(err.message);
      process.exit(err.exitCode);
    }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}
