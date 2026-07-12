import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { glob } from 'glob';
import { CoachError } from '../errors.js';
import { loadReadyConfigFromFile } from './ready-config.js';
import type { ContextPayload, TestSignals } from './types.js';

const execFileAsync = promisify(execFile);
export const DEFAULT_MAX_DIFF_BYTES = 102_400;

export function truncateDiff(
  diff: string,
  maxBytes = DEFAULT_MAX_DIFF_BYTES,
): { diff: string; truncated: boolean; originalSize: number } {
  const buf = Buffer.from(diff, 'utf8');
  const originalSize = buf.length;
  if (originalSize <= maxBytes) {
    return { diff, truncated: false, originalSize };
  }

  const prefix = buf.subarray(0, maxBytes).toString('utf8');
  const fileHeader = /\ndiff --git /g;
  let lastBoundary = -1;
  let match: RegExpExecArray | null;
  while ((match = fileHeader.exec(prefix)) !== null) {
    if (match.index > 0) lastBoundary = match.index;
  }

  if (lastBoundary > maxBytes * 0.5) {
    return {
      diff: prefix.slice(0, lastBoundary),
      truncated: true,
      originalSize,
    };
  }

  return { diff: prefix, truncated: true, originalSize };
}

async function git(
  repoPath: string,
  args: string[],
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      maxBuffer: 20 * 1024 * 1024,
      encoding: 'utf8',
    });
    return stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CoachError('GIT_FAILURE', `Git operation failed: git ${args.join(' ')} — ${msg}`);
  }
}

async function gitOk(repoPath: string, args: string[]): Promise<boolean> {
  try {
    await execFileAsync('git', args, { cwd: repoPath, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

async function resolveMergeBase(repoPath: string): Promise<string> {
  const upstream = await git(repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(
    () => '',
  );
  const candidates = [
    upstream.trim(),
    'origin/main',
    'main',
    'master',
    'origin/master',
  ].filter(Boolean);

  for (const ref of candidates) {
    if (await gitOk(repoPath, ['rev-parse', '--verify', ref])) {
      const mb = (await git(repoPath, ['merge-base', 'HEAD', ref])).trim();
      if (mb) return mb;
    }
  }
  throw new CoachError(
    'GIT_FAILURE',
    'Git operation failed: could not resolve merge base (missing upstream, origin/main, main, or master)',
  );
}

async function collectTestSignals(root: string): Promise<TestSignals | undefined> {
  const signals: TestSignals = {};
  let found = false;

  const xmlFiles = await glob('**/test-results.xml', { cwd: root, absolute: true, nodir: true });
  for (const file of xmlFiles) {
    const content = await fs.readFile(file, 'utf8');
    const tests = content.match(/tests="(\d+)"/);
    const failures = content.match(/failures="(\d+)"/);
    const errors = content.match(/errors="(\d+)"/);
    if (tests) {
      const total = Number(tests[1]);
      const fail = Number(failures?.[1] ?? 0) + Number(errors?.[1] ?? 0);
      signals.passCount = (signals.passCount ?? 0) + (total - fail);
      signals.failCount = (signals.failCount ?? 0) + fail;
      found = true;
    }
  }

  const summaryFiles = await glob('**/coverage/coverage-summary.json', {
    cwd: root,
    absolute: true,
    nodir: true,
  });
  for (const file of summaryFiles) {
    try {
      const json = JSON.parse(await fs.readFile(file, 'utf8')) as {
        total?: { lines?: { pct?: number } };
      };
      if (typeof json.total?.lines?.pct === 'number') {
        signals.lineCoverage = json.total.lines.pct;
        found = true;
      }
    } catch {
      // ignore
    }
  }

  const lcovFiles = await glob('**/coverage/lcov.info', { cwd: root, absolute: true, nodir: true });
  if (signals.lineCoverage === undefined && lcovFiles.length > 0) {
    const content = await fs.readFile(lcovFiles[0]!, 'utf8');
    let hit = 0;
    let foundLines = 0;
    for (const line of content.split('\n')) {
      if (line.startsWith('LH:')) hit += Number(line.slice(3)) || 0;
      if (line.startsWith('LF:')) foundLines += Number(line.slice(3)) || 0;
    }
    if (foundLines > 0) {
      signals.lineCoverage = Math.round((hit / foundLines) * 1000) / 10;
      found = true;
    }
  }

  return found ? signals : undefined;
}

async function collectSpecTaskCounts(
  root: string,
): Promise<{ open: number; total: number } | undefined> {
  const files = await glob('.kiro/specs/**/tasks.md', { cwd: root, absolute: true, nodir: true });
  if (files.length === 0) return undefined;
  let open = 0;
  let total = 0;
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    for (const line of content.split('\n')) {
      if (/^\s*-\s*\[[ xX]\]/.test(line)) {
        total += 1;
        if (/^\s*-\s*\[\s\]/.test(line)) open += 1;
      }
    }
  }
  return { open, total };
}

async function readReadyYml(root: string) {
  try {
    const content = await fs.readFile(path.join(root, 'ready.yml'), 'utf8');
    return loadReadyConfigFromFile(content);
  } catch {
    return loadReadyConfigFromFile(null);
  }
}

function synthesizeDiffFromFiles(
  files: Array<{ rel: string; content: string }>,
): string {
  const parts: string[] = [];
  for (const f of files) {
    parts.push(`diff --git a/${f.rel} b/${f.rel}`);
    parts.push(`--- a/${f.rel}`);
    parts.push(`+++ b/${f.rel}`);
    parts.push('@@ -0,0 +1,' + f.content.split('\n').length + ' @@');
    for (const line of f.content.split('\n')) {
      parts.push(`+${line}`);
    }
  }
  return parts.join('\n');
}

async function walkFiles(dir: string, base = dir): Promise<Array<{ rel: string; content: string }>> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: Array<{ rel: string; content: string }> = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      out.push(...(await walkFiles(full, base)));
    } else if (ent.isFile()) {
      const content = await fs.readFile(full, 'utf8');
      out.push({ rel: path.relative(base, full).split(path.sep).join('/'), content });
    }
  }
  return out;
}

export interface CollectOptions {
  maxDiffBytes?: number;
  branch?: string;
  mergeBase?: string;
}

export async function collectBranchContext(
  repoPath: string,
  options: CollectOptions = {},
): Promise<{ context: ContextPayload; configWarning?: string }> {
  const isRepo = await gitOk(repoPath, ['rev-parse', '--is-inside-work-tree']);
  if (!isRepo) {
    throw new CoachError('NO_GIT_REPO', 'No Git repository found');
  }

  const branch =
    options.branch ??
    (await git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const mergeBase = options.mergeBase ?? (await resolveMergeBase(repoPath));
  const status = await git(repoPath, ['status', '--porcelain']);
  const staged = await git(repoPath, ['diff', '--cached', mergeBase]);
  const unstaged = await git(repoPath, ['diff', mergeBase]);
  // Prefer unified working-tree vs merge-base (includes uncommitted)
  const rawDiff = await git(repoPath, ['diff', mergeBase, 'HEAD']);
  const working = await git(repoPath, ['diff']);
  const cached = await git(repoPath, ['diff', '--cached']);
  const combined =
    [rawDiff, working, cached].filter(Boolean).join('\n') ||
    [staged, unstaged].filter(Boolean).join('\n');

  const nameOnly = await git(repoPath, ['diff', '--name-only', mergeBase]);
  const changedFiles = [
    ...new Set(
      nameOnly
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  ];

  const ready = await readReadyYml(repoPath);
  const maxBytes = options.maxDiffBytes ?? ready.config.maxDiffSizeBytes ?? DEFAULT_MAX_DIFF_BYTES;
  const { diff, truncated, originalSize } = truncateDiff(combined, maxBytes);

  const context: ContextPayload = {
    repoPath,
    branch,
    mergeBase,
    diff,
    diffTruncated: truncated,
    diffOriginalSize: truncated ? originalSize : undefined,
    changedFiles,
    gitStatus: status,
    testSignals: await collectTestSignals(repoPath),
    specTaskCounts: await collectSpecTaskCounts(repoPath),
    definitionOfReady: ready.config,
    source: 'git',
  };

  return { context, configWarning: ready.warning };
}

export async function collectFixtureContext(
  dirPath: string,
  options: CollectOptions = {},
): Promise<{ context: ContextPayload; configWarning?: string }> {
  const abs = path.resolve(dirPath);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new CoachError('USAGE', `Fixture path is not a directory: ${dirPath}`);
  }

  const files = await walkFiles(abs);
  const changedFiles = files.map((f) => f.rel);
  const rawDiff = synthesizeDiffFromFiles(files);
  const ready = await readReadyYml(abs);
  // Also try parent repo ready.yml for demo convenience
  if (!ready.warning) {
    const parentReady = await readReadyYml(process.cwd()).catch(() => null);
    if (parentReady && !parentReady.warning) {
      // prefer fixture-local if it had ready.yml; otherwise use cwd
      try {
        await fs.access(path.join(abs, 'ready.yml'));
      } catch {
        Object.assign(ready, parentReady);
      }
    }
  }

  const maxBytes = options.maxDiffBytes ?? ready.config.maxDiffSizeBytes ?? DEFAULT_MAX_DIFF_BYTES;
  const { diff, truncated, originalSize } = truncateDiff(rawDiff, maxBytes);

  const context: ContextPayload = {
    repoPath: abs,
    branch: options.branch ?? path.basename(abs),
    mergeBase: options.mergeBase ?? 'fixture',
    diff,
    diffTruncated: truncated,
    diffOriginalSize: truncated ? originalSize : undefined,
    changedFiles,
    gitStatus: changedFiles.map((f) => `?? ${f}`).join('\n'),
    testSignals: await collectTestSignals(abs),
    specTaskCounts: await collectSpecTaskCounts(abs),
    definitionOfReady: ready.config,
    source: 'fixture-path',
  };

  return { context, configWarning: ready.warning };
}
