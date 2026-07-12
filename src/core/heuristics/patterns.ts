import type { Finding } from './types.js';

export const SECRET_VALUE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github-pat', regex: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: 'stripe-live', regex: /\bsk-live_[A-Za-z0-9]+\b/ },
  {
    name: 'private-key-header',
    regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/,
  },
  {
    name: 'secret-assignment',
    // Require a string literal or long opaque token — not `apiKey = opts.apiKey`
    regex:
      /\b(?:secret|token|password|api[_-]?key)\b\s*[:=]\s*(['"][^'"]{8,}['"]|[A-Za-z0-9_/+-]{20,})/i,
  },
];

export const SENSITIVE_PATH_GLOBS = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\./,
  /credentials/i,
  /\.pem$/i,
];

export const TODO_FIXME = /\b(TODO|FIXME)\b/i;
export const DEBUG_LOG =
  /\bconsole\.(log|debug)\b|\bdebugger\b|\bprint\s*\(|\bSystem\.out\.println\b/;

export interface DiffLine {
  filePath?: string;
  lineNumber?: number;
  text: string;
  kind: 'add' | 'remove' | 'context' | 'header';
}

/** Parse unified diff into line records with approximate new-file line numbers. */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines = diff.split(/\r?\n/);
  const out: DiffLine[] = [];
  let filePath: string | undefined;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/diff --git a\/(.+?) b\/(.+)$/);
      filePath = m?.[2] ?? m?.[1];
      newLine = 0;
      out.push({ filePath, text: line, kind: 'header' });
      continue;
    }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      if (p !== '/dev/null') filePath = p.replace(/^b\//, '');
      out.push({ filePath, text: line, kind: 'header' });
      continue;
    }
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      newLine = m ? Number(m[1]) : 0;
      out.push({ filePath, text: line, kind: 'header' });
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      out.push({ filePath, lineNumber: newLine, text: line.slice(1), kind: 'add' });
      newLine += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      out.push({ filePath, text: line.slice(1), kind: 'remove' });
      continue;
    }
    if (line.startsWith(' ') || line === '') {
      out.push({ filePath, lineNumber: newLine || undefined, text: line.slice(1), kind: 'context' });
      if (line.startsWith(' ')) newLine += 1;
      continue;
    }
    out.push({ filePath, text: line, kind: 'header' });
  }
  return out;
}

export function pathLooksSensitive(filePath: string): boolean {
  return SENSITIVE_PATH_GLOBS.some((re) => re.test(filePath));
}

/** True when text contains a literal built-in secret marker (AKIA, ghp_, etc.). */
export function textContainsLiteralSecret(text: string): boolean {
  return SECRET_VALUE_PATTERNS.some((p) => p.regex.test(text));
}

/** Scan unified-diff added lines for literal secret markers. */
export function diffContainsLiteralSecret(diff: string): boolean {
  for (const line of diff.split(/\r?\n/)) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    if (textContainsLiteralSecret(line.slice(1))) return true;
  }
  return false;
}

export function finding(
  severity: Finding['severity'],
  category: string,
  description: string,
  filePath?: string,
  lineNumber?: number,
): Finding {
  return { severity, category, description, filePath, lineNumber };
}
