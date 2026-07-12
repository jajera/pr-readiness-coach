import type { ContextPayload, DefinitionOfReady } from '../context/types.js';
import {
  DEBUG_LOG,
  SECRET_VALUE_PATTERNS,
  TODO_FIXME,
  finding,
  parseUnifiedDiff,
  pathLooksSensitive,
} from './patterns.js';
import type { Finding, HeuristicResult } from './types.js';

export function matchGlob(filePath: string, pattern: string): boolean {
  // Minimal glob: **, *, and leading **/ optional for basename matches
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DS::/g, '.*');
  const re = new RegExp(`^${escaped}$`);
  if (re.test(filePath)) return true;
  // `**/*.test.ts` should also match top-level `webhook.test.ts`
  const optionalSlash = new RegExp(`^${escaped.replace(/^\.\*\//, '(?:.*\\/)?')}$`);
  return optionalSlash.test(filePath);
}

export function isAllowlistedPath(
  filePath: string,
  allowlist: string[] | undefined,
): boolean {
  if (!allowlist?.length) return false;
  return allowlist.some(
    (p) => matchGlob(filePath, p) || matchGlob(filePath.split('/').pop() ?? filePath, p),
  );
}

export function runHeuristicChecks(
  context: ContextPayload,
  config: DefinitionOfReady = context.definitionOfReady,
): HeuristicResult {
  const started = Date.now();
  const blockers: Finding[] = [];
  const warnings: Finding[] = [];
  const docsAllowlist = config.docsPathAllowlist ?? [];
  const testAllowlist = config.testPathAllowlist ?? [];

  for (const filePath of context.changedFiles) {
    if (pathLooksSensitive(filePath)) {
      blockers.push(
        finding(
          'blocker',
          'sensitive-path',
          `Sensitive path in change set: ${filePath}`,
          filePath,
        ),
      );
    }
    for (const pat of config.forbiddenPatterns ?? []) {
      if (matchGlob(filePath, pat) || matchGlob(filePath.split('/').pop() ?? filePath, pat)) {
        blockers.push(
          finding(
            'blocker',
            'forbidden-path',
            `Forbidden path pattern "${pat}" matched: ${filePath}`,
            filePath,
          ),
        );
      }
    }
  }

  const lines = parseUnifiedDiff(context.diff);
  for (const line of lines) {
    if (line.kind !== 'add') continue;
    const path = line.filePath ?? '';
    // Unit-test fixtures: skip all line heuristics (including sample secrets)
    if (isAllowlistedPath(path, testAllowlist)) continue;

    const docsAllowlisted = isAllowlistedPath(path, docsAllowlist);

    for (const secret of SECRET_VALUE_PATTERNS) {
      if (secret.regex.test(line.text)) {
        blockers.push(
          finding(
            'blocker',
            'secret',
            `Possible secret (${secret.name}) in added line`,
            line.filePath,
            line.lineNumber,
          ),
        );
      }
    }

    // Soft heuristics skipped on docsPathAllowlist (secrets still apply)
    if (docsAllowlisted) continue;

    if (TODO_FIXME.test(line.text)) {
      warnings.push(
        finding(
          'warning',
          'todo',
          `TODO/FIXME in added line: ${line.text.trim().slice(0, 120)}`,
          line.filePath,
          line.lineNumber,
        ),
      );
    }

    if (DEBUG_LOG.test(line.text)) {
      warnings.push(
        finding(
          'warning',
          'debug-log',
          `Debug/log statement in added line: ${line.text.trim().slice(0, 120)}`,
          line.filePath,
          line.lineNumber,
        ),
      );
    }

    const customs = (config.customBlockers ?? []).slice(0, 20);
    for (const rule of customs) {
      let re: RegExp;
      try {
        re = new RegExp(rule.pattern, 'i');
      } catch {
        warnings.push(
          finding(
            'warning',
            'config',
            `Invalid custom regex skipped: ${rule.pattern}`,
          ),
        );
        continue;
      }
      if (re.test(line.text)) {
        const f = finding(
          rule.severity,
          'custom',
          rule.description ?? `Custom rule matched: ${rule.pattern}`,
          line.filePath,
          line.lineNumber,
        );
        if (rule.severity === 'blocker') blockers.push(f);
        else warnings.push(f);
      }
    }
  }

  if (context.diffTruncated) {
    warnings.push(
      finding(
        'warning',
        'diff-size',
        `Diff truncated to limit (original size ${context.diffOriginalSize ?? 'unknown'} bytes)`,
      ),
    );
  } else {
    const max = config.maxDiffSizeBytes ?? 102_400;
    const size = Buffer.byteLength(context.diff, 'utf8');
    if (size > max) {
      warnings.push(
        finding(
          'warning',
          'diff-size',
          `Diff size ${size} exceeds configured maxDiffSizeBytes ${max}`,
        ),
      );
    }
  }

  // Missing tests for source files when test patterns configured
  const testPatterns = config.testFilePatterns ?? [];
  if (testPatterns.length > 0) {
    const sources = context.changedFiles.filter(
      (f) =>
        !isAllowlistedPath(f, docsAllowlist) &&
        !isAllowlistedPath(f, testAllowlist) &&
        /\.(ts|js|tsx|jsx|py|go|java)$/.test(f) &&
        !testPatterns.some((p) => matchGlob(f, p)) &&
        !f.includes('.test.') &&
        !f.includes('.spec.') &&
        !f.includes('/tests/') &&
        !f.endsWith('.env') &&
        !f.includes('.env.'),
    );
    const tests = context.changedFiles.filter((f) =>
      testPatterns.some((p) => matchGlob(f, p)) ||
      f.includes('.test.') ||
      f.includes('.spec.') ||
      f.includes('/tests/'),
    );
    if (sources.length > 0 && tests.length === 0) {
      blockers.push(
        finding(
          'blocker',
          'missing-tests',
          `Source changes without corresponding test files: ${sources.slice(0, 5).join(', ')}`,
          sources[0],
        ),
      );
    }
  }

  return {
    blockers,
    warnings,
    durationMs: Date.now() - started,
  };
}
