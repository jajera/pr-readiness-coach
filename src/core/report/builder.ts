import type { ContextPayload, DefinitionOfReady } from '../context/types.js';
import type { Finding, HeuristicResult } from '../heuristics/types.js';
import { diffContainsLiteralSecret } from '../heuristics/patterns.js';
import type { DiffAnalysis, RiskAssessment, ShipCoachFields } from '../pipeline/types.js';
import type { ChecklistItem, ReadinessReport, Verdict } from './types.js';

export function determineVerdict(blockers: Finding[], warnings: Finding[]): Verdict {
  if (blockers.length > 0) return 'NOT READY';
  if (warnings.length > 0) return 'READY WITH WARNINGS';
  return 'READY';
}

function riskToFindings(risk: RiskAssessment): Finding[] {
  const items = [
    ...risk.securityRisks,
    ...risk.complexityRisks,
    ...risk.coverageGaps,
  ];
  return items.map((r) => ({
    severity: r.severity,
    category: 'ai-risk',
    description: r.description,
    filePath: r.filePath,
    lineNumber: r.lineNumber,
  }));
}

/** Added-line evidence of a real PassRole Resource "*" widen (not docs/workflow chatter). */
function hasPassRoleStarEvidenceInDiff(diff: string): boolean {
  const added = diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
  if (!added) return false;

  // Workflow YAML never carries IAM PassRole policies — ignore those hunks.
  const withoutWorkflowHunks = added.replace(
    /diff --git a\/\.github\/workflows\/[\s\S]*?(?=diff --git |\s*$)/g,
    '',
  );
  const hay = withoutWorkflowHunks.length > 0 ? withoutWorkflowHunks : added;
  const lower = hay.toLowerCase();
  const hasPassRole = lower.includes('iam:passrole') || /"action"\s*:\s*"iam:passrole"/i.test(hay);
  const hasResourceStar =
    /"resource"\s*:\s*"\*"/i.test(hay) ||
    /resource\s*[:=]\s*["']?\*/i.test(hay) ||
    lower.includes('resource "*"');
  return hasPassRole && hasResourceStar;
}

function isPassRoleNoise(desc: string, context: ContextPayload): boolean {
  const d = desc.toLowerCase();
  if (!/passrole|sts:assumerole|assumerole/i.test(d)) return false;

  // GitHub workflow files do not contain IAM PassRole policies.
  if (/\.ya?ml\b|deploy\.yml|ci\.yml|workflow/i.test(d)) return true;

  // Vague PassRole chatter without concrete Resource "*" evidence in the diff.
  const claimsStar = /resource\s*\*?["']?\*?["']?|\bresou?rce\s*"?\*"?/i.test(d) && d.includes('*');
  if (claimsStar && !hasPassRoleStarEvidenceInDiff(context.diff)) return true;

  // Scoped / process PassRole noise.
  if (/threat model|stay scoped|properly scoped|confirm passrole|could expose/i.test(d)) return true;
  return false;
}

function isDeployMetaNoise(desc: string): boolean {
  const workflowOrCicd = /workflow|ci\/?cd|pipeline|deploy\.yml|aws action/i.test(desc);
  const asksForExtraValidation =
    /ensure|confirm|verify|validate|validated|manual testing|manual log inspection|staging recommended|functioning|breaking changes|regression|scope to specific/i.test(
      desc,
    );
  const coverageOrTests = /no unit tests?|lack direct unit test coverage|coveragegaps?/i.test(desc);
  const redactionMeta =
    /redact|redaction|masking|mask sensitive|debugging information|over-redacted|special characters|malformed urls|nested outputs/i.test(
      desc,
    );
  const heuristicMeta =
    /ignore false positives|focusing on real security concerns|verify no real security concerns are masked/i.test(
      desc,
    );

  if (/no unit tests for iam/i.test(desc)) return true;
  if (/no unit tests for yaml\/markdown\/workflow-only changes/i.test(desc)) return true;
  if (redactionMeta && (asksForExtraValidation || coverageOrTests || workflowOrCicd)) return true;
  if (workflowOrCicd && (asksForExtraValidation || coverageOrTests)) return true;
  if (heuristicMeta) return true;
  return false;
}

function claimsSecretLeak(desc: string): boolean {
  return /aws key|access key|secret leak|leaked secret|possible secret|credentials? leak|akia/i.test(
    desc,
  );
}

/**
 * Drop AI PassRole / deploy-process / invented-secret false positives.
 * Secret leaks require literal marker evidence (or heuristics already caught them).
 */
export function sanitizeAiFindings(
  findings: Finding[],
  context: ContextPayload,
  heuristics?: HeuristicResult,
): Finding[] {
  const kept: Finding[] = [];
  const seen = new Set<string>();
  const heuristicHasSecret = Boolean(
    heuristics?.blockers.some((b) => b.category === 'secret' || b.category === 'sensitive-path'),
  );
  const diffHasSecret = diffContainsLiteralSecret(context.diff);

  for (const f of findings) {
    const desc = (f.description ?? '').trim();
    if (!desc) continue;

    const norm = desc.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(norm)) continue;
    seen.add(norm);

    if (isPassRoleNoise(desc, context)) continue;
    if (isDeployMetaNoise(desc)) continue;

    // Real widen: PassRole + Resource "*" with evidence in the diff.
    const claimsWiden =
      /passrole/i.test(desc) &&
      (/resource\s*"?\*"?/i.test(desc) || /resource\s*\*/i.test(desc));
    if (claimsWiden && !hasPassRoleStarEvidenceInDiff(context.diff)) continue;

    // Invented "AWS key leak in IAM policy" — IAM Action/Resource/ARN JSON is not a key.
    if (claimsSecretLeak(desc) && !heuristicHasSecret && !diffHasSecret) continue;

    kept.push(f);
  }

  return kept;
}

export function buildChecklist(
  context: ContextPayload,
  heuristics: HeuristicResult,
  config: DefinitionOfReady = context.definitionOfReady,
): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  const hasSecret = heuristics.blockers.some((b) => b.category === 'secret' || b.category === 'sensitive-path');
  items.push({
    rule: 'No secrets or sensitive paths in changes',
    passed: !hasSecret,
    detail: hasSecret ? 'Secret/sensitive-path blockers present' : undefined,
  });

  const hasTodo = heuristics.warnings.some((b) => b.category === 'todo');
  items.push({
    rule: 'No TODO/FIXME in added lines',
    passed: !hasTodo,
  });

  const hasDebug = heuristics.warnings.some((b) => b.category === 'debug-log');
  items.push({
    rule: 'No debug log statements in added lines',
    passed: !hasDebug,
  });

  const hasDiffWarn = heuristics.warnings.some((b) => b.category === 'diff-size') || context.diffTruncated;
  items.push({
    rule: `Diff within size limit (${config.maxDiffSizeBytes ?? 102400} bytes)`,
    passed: !hasDiffWarn,
  });

  const missingTests = heuristics.blockers.some((b) => b.category === 'missing-tests');
  items.push({
    rule: 'Source changes accompanied by tests (when patterns configured)',
    passed: !missingTests,
  });

  for (const rule of config.customBlockers ?? []) {
    const hit = [...heuristics.blockers, ...heuristics.warnings].some(
      (f) => f.category === 'custom' && f.description?.includes(rule.pattern),
    );
    items.push({
      rule: rule.description ?? `Custom rule: ${rule.pattern}`,
      passed: !hit,
    });
  }

  return items;
}

function topActionsFromFindings(blockers: Finding[], warnings: Finding[], limit = 3): string[] {
  const ordered = [...blockers, ...warnings];
  const actions: string[] = [];
  for (const f of ordered) {
    const loc = f.filePath
      ? `${f.filePath}${f.lineNumber ? `:${f.lineNumber}` : ''}`
      : 'change set';
    actions.push(`Fix ${f.severity}: ${f.description} (${loc})`);
    if (actions.length >= limit) break;
  }
  return actions;
}

export interface BuildReportInput {
  context: ContextPayload;
  heuristics: HeuristicResult;
  ai?: {
    diff?: DiffAnalysis;
    risk?: RiskAssessment;
    ship?: ShipCoachFields;
  };
  degradedReason?: string;
  configWarning?: string;
  modelIds?: ReadinessReport['metadata']['modelIds'];
}

function composeDraftPrBody(ship: ShipCoachFields): string | undefined {
  const hasStructured =
    Boolean(ship.draftPrSummary) ||
    (ship.draftPrTestPlan?.length ?? 0) > 0 ||
    (ship.draftPrRiskNotes?.length ?? 0) > 0;
  if (!hasStructured) {
    return ship.draftPrBody?.slice(0, 4000);
  }
  const parts: string[] = [];
  if (ship.draftPrSummary) {
    parts.push('## Summary', ship.draftPrSummary);
  }
  if (ship.draftPrTestPlan?.length) {
    parts.push('', '## Test plan');
    for (const step of ship.draftPrTestPlan.slice(0, 8)) {
      parts.push(`- [ ] ${step}`);
    }
  }
  if (ship.draftPrRiskNotes?.length) {
    parts.push('', '## Risk notes');
    for (const note of ship.draftPrRiskNotes.slice(0, 6)) {
      parts.push(`- ${note}`);
    }
  }
  return parts.join('\n').slice(0, 4000);
}

export function buildReport(input: BuildReportInput): ReadinessReport {
  const { context, heuristics, ai, degradedReason, configWarning, modelIds } = input;
  // Ship Coach is the merge authority when present; otherwise surface Risk findings directly.
  let aiFindings: Finding[] = [];
  if (ai?.ship) {
    if (ai.ship.blockers) aiFindings.push(...ai.ship.blockers);
    if (ai.ship.warnings) aiFindings.push(...ai.ship.warnings);
  } else if (ai?.risk) {
    aiFindings.push(...riskToFindings(ai.risk));
  }
  aiFindings = sanitizeAiFindings(aiFindings, context, heuristics);

  const blockers = [...heuristics.blockers, ...aiFindings.filter((f) => f.severity === 'blocker')];
  const warnings = [...heuristics.warnings, ...aiFindings.filter((f) => f.severity === 'warning')];

  if (configWarning) {
    warnings.push({
      severity: 'warning',
      category: 'config',
      description: configWarning,
    });
  }

  if (degradedReason) {
    warnings.push({
      severity: 'warning',
      category: 'ai-unavailable',
      description: `AI analysis unavailable: ${degradedReason}`,
    });
  }

  const checklist =
    ai?.ship?.checklist && ai.ship.checklist.length > 0
      ? ai.ship.checklist
      : buildChecklist(context, heuristics);

  const verdict = determineVerdict(blockers, warnings);
  const pipelineMode = degradedReason || !ai ? 'heuristic-only' : 'full';

  const report: ReadinessReport = {
    verdict,
    blockers,
    warnings,
    checklist,
    metadata: {
      branch: context.branch,
      timestamp: new Date().toISOString(),
      pipelineMode,
      aiUnavailableWarning: degradedReason
        ? `AI analysis unavailable: ${degradedReason}`
        : undefined,
      modelIds: pipelineMode === 'full' ? modelIds : undefined,
    },
  };

  if (pipelineMode === 'full' && ai?.ship) {
    const ship = ai.ship;
    report.draftPrTitle = ship.draftPrTitle?.slice(0, 72);
    report.draftPrSummary = ship.draftPrSummary?.slice(0, 2000);
    report.draftPrTestPlan = ship.draftPrTestPlan?.slice(0, 8);
    report.draftPrRiskNotes = ship.draftPrRiskNotes?.slice(0, 6);
    report.draftPrBody = composeDraftPrBody(ship);
    report.topActions =
      ship.topActions?.slice(0, 3) ??
      (verdict === 'READY' ? undefined : topActionsFromFindings(blockers, warnings));
  }

  return report;
}
