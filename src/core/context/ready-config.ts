import type { CustomBlocker, DefinitionOfReady } from './types.js';
import { load as yamlLoad } from 'js-yaml';

const MIN_DIFF = 1024;
const MAX_DIFF = 10_485_760;
const MAX_CUSTOM = 20;

export const DEFAULT_READY_CONFIG: DefinitionOfReady = {
  testFilePatterns: ['**/*.test.ts', '**/*.test.js', '**/tests/**', '**/__tests__/**'],
  forbiddenPatterns: ['*.env', '*.env.*', '*.pem', '*credentials*'],
  maxDiffSizeBytes: 102_400,
  customBlockers: [],
  docsPathAllowlist: [],
  testPathAllowlist: [
    'tests/**',
    '**/__tests__/**',
    'fixtures/**',
  ],
};

export interface ParseReadyResult {
  config: DefinitionOfReady;
  warning?: string;
}

function isSeverity(v: unknown): v is CustomBlocker['severity'] {
  return v === 'blocker' || v === 'warning';
}

function validateCustomBlockers(raw: unknown): { blockers: CustomBlocker[]; warning?: string } {
  if (raw === undefined || raw === null) return { blockers: [] };
  if (!Array.isArray(raw)) {
    return { blockers: [], warning: 'customBlockers must be an array; ignored' };
  }
  if (raw.length > MAX_CUSTOM) {
    return {
      blockers: [],
      warning: `customBlockers exceeds ${MAX_CUSTOM}; using defaults`,
    };
  }

  const blockers: CustomBlocker[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { blockers: [], warning: 'invalid customBlocker entry; using defaults' };
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.pattern !== 'string' || !isSeverity(rec.severity)) {
      return { blockers: [], warning: 'invalid customBlocker fields; using defaults' };
    }
    try {
      new RegExp(rec.pattern);
    } catch {
      return {
        blockers: [],
        warning: `invalid customBlocker regex "${rec.pattern}"; using defaults`,
      };
    }
    blockers.push({
      pattern: rec.pattern,
      severity: rec.severity,
      description: typeof rec.description === 'string' ? rec.description : undefined,
    });
  }
  return { blockers };
}

export function parseReadyConfig(yamlString: string): ParseReadyResult {
  if (!yamlString.trim()) {
    return { config: { ...DEFAULT_READY_CONFIG, customBlockers: [] } };
  }

  let parsed: unknown;
  try {
    parsed = yamlLoad(yamlString);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      config: structuredClone(DEFAULT_READY_CONFIG),
      warning: `Failed to parse ready.yml (${msg}); using defaults`,
    };
  }

  if (parsed === null || parsed === undefined) {
    return { config: structuredClone(DEFAULT_READY_CONFIG) };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      config: structuredClone(DEFAULT_READY_CONFIG),
      warning: 'ready.yml root must be a mapping; using defaults',
    };
  }

  const obj = parsed as Record<string, unknown>;
  const config: DefinitionOfReady = structuredClone(DEFAULT_READY_CONFIG);
  const warnings: string[] = [];

  if (obj.testFilePatterns !== undefined) {
    if (
      Array.isArray(obj.testFilePatterns) &&
      obj.testFilePatterns.every((p) => typeof p === 'string')
    ) {
      config.testFilePatterns = obj.testFilePatterns as string[];
    } else {
      warnings.push('invalid testFilePatterns; kept defaults');
    }
  }

  if (obj.forbiddenPatterns !== undefined) {
    if (
      Array.isArray(obj.forbiddenPatterns) &&
      obj.forbiddenPatterns.every((p) => typeof p === 'string')
    ) {
      config.forbiddenPatterns = obj.forbiddenPatterns as string[];
    } else {
      warnings.push('invalid forbiddenPatterns; kept defaults');
    }
  }

  if (obj.maxDiffSizeBytes !== undefined) {
    const n = obj.maxDiffSizeBytes;
    if (typeof n === 'number' && Number.isFinite(n) && n >= MIN_DIFF && n <= MAX_DIFF) {
      config.maxDiffSizeBytes = Math.floor(n);
    } else {
      return {
        config: structuredClone(DEFAULT_READY_CONFIG),
        warning: `maxDiffSizeBytes out of range ${MIN_DIFF}..${MAX_DIFF}; using defaults`,
      };
    }
  }

  const custom = validateCustomBlockers(obj.customBlockers);
  if (custom.warning) {
    return {
      config: structuredClone(DEFAULT_READY_CONFIG),
      warning: custom.warning,
    };
  }
  config.customBlockers = custom.blockers;

  if (obj.docsPathAllowlist !== undefined) {
    if (
      Array.isArray(obj.docsPathAllowlist) &&
      obj.docsPathAllowlist.every((p) => typeof p === 'string')
    ) {
      config.docsPathAllowlist = obj.docsPathAllowlist as string[];
    } else {
      warnings.push('invalid docsPathAllowlist; kept defaults');
    }
  }

  if (obj.testPathAllowlist !== undefined) {
    if (
      Array.isArray(obj.testPathAllowlist) &&
      obj.testPathAllowlist.every((p) => typeof p === 'string')
    ) {
      config.testPathAllowlist = obj.testPathAllowlist as string[];
    } else {
      warnings.push('invalid testPathAllowlist; kept defaults');
    }
  }

  if (warnings.length > 0) {
    return { config, warning: warnings.join('; ') };
  }
  return { config };
}

export function loadReadyConfigFromFile(content: string | null | undefined): ParseReadyResult {
  if (content === null || content === undefined) {
    return { config: structuredClone(DEFAULT_READY_CONFIG) };
  }
  return parseReadyConfig(content);
}
