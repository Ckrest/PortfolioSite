/** Structured exact-subject validation shared by Site source and pool builds. */

export const VALIDATION_SCHEMA = 'portfolio/review-validation@1';

const OUTCOMES = new Set([
  'pass', 'fail', 'warning', 'unknown', 'stale', 'conflicting',
  'skipped', 'not-applicable',
]);
const CONSEQUENCES = new Set(['required-gate', 'advisory', 'degraded', 'recovery-only']);

export function validationIssue({
  code,
  outcome = 'fail',
  consequence = outcome === 'warning' ? 'advisory' : 'required-gate',
  stage,
  owner,
  subject,
  location,
  message,
  evidence,
  action,
}) {
  if (!code || !OUTCOMES.has(outcome) || !CONSEQUENCES.has(consequence)) {
    throw new Error('validation issue has an invalid identity, outcome, or consequence');
  }
  if (!stage || !owner || !subject || !message) {
    throw new Error(`validation issue ${code} is missing its stage, owner, subject, or message`);
  }
  return {
    code,
    outcome,
    consequence,
    stage,
    owner,
    subject,
    ...(location ? { location } : {}),
    message,
    ...(evidence ? { evidence } : {}),
    action: action || { kind: 'none' },
  };
}

export function validationSummary(issues) {
  const counts = {
    total: issues.length,
    blockers: 0,
    warnings: 0,
    unknown: 0,
    passes: 0,
  };
  for (const issue of issues) {
    if (issue.outcome === 'pass') counts.passes += 1;
    if (issue.outcome === 'warning') counts.warnings += 1;
    if (['unknown', 'stale', 'conflicting'].includes(issue.outcome)) counts.unknown += 1;
    if (
      issue.consequence === 'required-gate'
      && !['pass', 'warning', 'not-applicable'].includes(issue.outcome)
    ) counts.blockers += 1;
  }
  return counts;
}

export function validationResult(issues, scope = {}) {
  return {
    schema: VALIDATION_SCHEMA,
    scope,
    issues,
    summary: validationSummary(issues),
  };
}

export function systemIssue(code, stage, message, evidence = undefined) {
  return validationIssue({
    code,
    outcome: 'unknown',
    consequence: 'recovery-only',
    stage,
    owner: 'portfolio-site',
    subject: { kind: 'site-build', id: stage, label: 'Portfolio Site build' },
    message,
    evidence,
    action: { kind: 'retry-review' },
  });
}
