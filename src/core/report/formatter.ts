import chalk from 'chalk';
import type { ReadinessReport } from './types.js';

function colorVerdict(verdict: ReadinessReport['verdict'], useColor: boolean): string {
  if (!useColor) return verdict;
  if (verdict === 'READY') return chalk.green(verdict);
  if (verdict === 'READY WITH WARNINGS') return chalk.yellow(verdict);
  return chalk.red(verdict);
}

export function formatHumanReport(report: ReadinessReport, useColor = true): string {
  const lines: string[] = [];
  lines.push('======== PR Readiness Coach ========');
  lines.push(`Verdict: ${colorVerdict(report.verdict, useColor)}`);
  lines.push(`Branch: ${report.metadata.branch}`);
  lines.push(`Mode: ${report.metadata.pipelineMode}`);
  lines.push(`Time: ${report.metadata.timestamp}`);
  lines.push('');

  lines.push('--- Blockers ---');
  if (report.blockers.length === 0) lines.push('(none)');
  for (const b of report.blockers) {
    const loc = b.filePath
      ? ` [${b.filePath}${b.lineNumber ? `:${b.lineNumber}` : ''}]`
      : '';
    lines.push(`- [${b.category}] ${b.description}${loc}`);
  }
  lines.push('');

  lines.push('--- Warnings ---');
  if (report.warnings.length === 0) lines.push('(none)');
  for (const w of report.warnings) {
    const loc = w.filePath
      ? ` [${w.filePath}${w.lineNumber ? `:${w.lineNumber}` : ''}]`
      : '';
    lines.push(`- [${w.category}] ${w.description}${loc}`);
  }
  lines.push('');

  lines.push('--- Checklist ---');
  for (const c of report.checklist) {
    lines.push(`- [${c.passed ? 'x' : ' '}] ${c.rule}${c.detail ? ` — ${c.detail}` : ''}`);
  }

  if (report.draftPrTitle) {
    lines.push('');
    lines.push('--- Draft PR ---');
    lines.push(`Title: ${report.draftPrTitle}`);
    if (report.draftPrSummary) {
      lines.push('');
      lines.push('## Summary');
      lines.push(report.draftPrSummary);
    }
    if (report.draftPrTestPlan?.length) {
      lines.push('');
      lines.push('## Test plan');
      for (const step of report.draftPrTestPlan) {
        lines.push(`- [ ] ${step}`);
      }
    }
    if (report.draftPrRiskNotes?.length) {
      lines.push('');
      lines.push('## Risk notes');
      for (const note of report.draftPrRiskNotes) {
        lines.push(`- ${note}`);
      }
    } else if (report.draftPrBody && !report.draftPrSummary) {
      lines.push(report.draftPrBody);
    }
  }

  if (report.topActions?.length) {
    lines.push('');
    lines.push('--- Top actions ---');
    report.topActions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  }

  if (report.metadata.aiUnavailableWarning) {
    lines.push('');
    lines.push(`Note: ${report.metadata.aiUnavailableWarning}`);
  }

  lines.push('====================================');
  return lines.join('\n');
}

export function formatJsonReport(report: ReadinessReport): string {
  return JSON.stringify(report, null, 2);
}

export function exitCodeForReport(report: ReadinessReport): number {
  return report.verdict === 'NOT READY' ? 1 : 0;
}
