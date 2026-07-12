/**
 * Redact sensitive CDK deploy log lines for public GitHub Actions logs.
 * Used by `.github/workflows/deploy.yml` (stdin → stdout).
 */

const EXECUTE_API_URL_RE =
  /https:\/\/[A-Za-z0-9_-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com[^\s]*/g;

const STACK_OUTPUT_LINE_RE = /(PrReadinessCoachStack\.[A-Za-z0-9_]+) = .+/g;

/** STS AssumedRoleUser.AssumedRoleId (e.g. AROA…:GitHubActions). */
const ASSUMED_ROLE_ID_RE = /assumedRoleId\s+AROA[A-Z0-9]+(?::\S+)?/gi;

/** Redact a single CDK deploy log line (or multi-line chunk). */
export function redactDeployLogLine(line: string): string {
  return line
    .replace(EXECUTE_API_URL_RE, '***')
    .replace(STACK_OUTPUT_LINE_RE, '$1 = ***')
    .replace(ASSUMED_ROLE_ID_RE, 'assumedRoleId ***');
}

/** Redact a full CDK deploy log (preserves newlines). */
export function redactDeployLog(text: string): string {
  return text.split('\n').map(redactDeployLogLine).join('\n');
}

/**
 * Values safe to emit as `::add-mask::` for GitHub Actions.
 * Skips empty / AWS CLI "None" placeholders.
 */
export function maskableStackOutputValues(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const val = raw.trim();
    if (!val || val === 'None') continue;
    if (seen.has(val)) continue;
    seen.add(val);
    out.push(val);
  }
  return out;
}

export function formatGithubAddMask(value: string): string {
  return `::add-mask::${value}`;
}

/** CLI: pipe CDK deploy stdout/stderr through redaction. */
async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  process.stdout.write(redactDeployLog(text));
}

const isDirectRun =
  process.argv[1]?.endsWith('redact-deploy-log.js') ||
  process.argv[1]?.endsWith('redact-deploy-log.ts');

if (isDirectRun) {
  main().catch((err) => {
    process.stderr.write(String(err instanceof Error ? err.stack ?? err.message : err));
    process.exit(1);
  });
}
