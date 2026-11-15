/**
 * Matching engine: scores one opportunity against a profile, and ranks a set of
 * opportunities. Deterministic and side-effect free, so the same input always
 * produces the same output (and is straightforward to unit test).
 */
import { WEIGHTS, LABEL_THRESHOLDS } from './taxonomy.js';
import {
  evaluateSkills,
  evaluateExperience,
  evaluateEducation,
  evaluateLocation,
  evaluateLanguage,
  evaluateInterests,
  evaluateEligibility,
} from './criteria.js';
import { listText } from './normalize.js';

/** Below this share of the scoring model, a role cannot be labelled a strong match. */
export const MIN_COVERAGE_FOR_STRONG = 50;

export const CRITERIA = Object.freeze([
  { key: 'skills', label: 'Skills', evaluate: evaluateSkills },
  { key: 'experience', label: 'Experience', evaluate: evaluateExperience },
  { key: 'education', label: 'Education', evaluate: evaluateEducation },
  { key: 'location', label: 'Location', evaluate: evaluateLocation },
  { key: 'language', label: 'Language', evaluate: evaluateLanguage },
  { key: 'interests', label: 'Career interests', evaluate: evaluateInterests },
]);

const LABEL_TEXT = {
  strong: 'Strong match',
  partial: 'Partial match',
  weak: 'Weak match',
  'critical-gap': 'Critical requirement gap',
};

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @returns {{
 *   score: number, label: string, labelText: string,
 *   eligibility: 'clear'|'verify'|'blocked',
 *   coverage: number, breakdown: object[], strengths: string[], gaps: string[],
 *   flags: object[], summary: string
 * }}
 */
export function matchOpportunity(profile, opportunity) {
  const evaluated = CRITERIA.map(({ key, label, evaluate }) => ({
    key,
    label,
    weight: WEIGHTS[key],
    ...evaluate(profile, opportunity),
  }));

  const applicable = evaluated.filter((c) => c.applicable);
  const applicableWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const raw = applicable.reduce((sum, c) => sum + c.weight * c.score, 0);
  const score = applicableWeight ? Math.round((100 * raw) / applicableWeight) : 0;

  // Points are rescaled so the visible breakdown always adds up to the score.
  const breakdown = evaluated.map((c) => ({
    key: c.key,
    label: c.label,
    weight: c.weight,
    applicable: c.applicable,
    score: c.applicable ? round1(c.score) : null,
    maxPoints: c.applicable ? round1((100 * c.weight) / applicableWeight) : 0,
    points: c.applicable ? round1((100 * c.weight * c.score) / applicableWeight) : 0,
    strengths: c.strengths,
    gaps: c.gaps,
    note: c.note ?? null,
    details: c.details ?? null,
  }));

  const flags = [...evaluated.flatMap((c) => c.flags), ...evaluateEligibility(profile, opportunity)];
  if (applicableWeight < MIN_COVERAGE_FOR_STRONG) {
    flags.push({
      severity: 'info',
      code: 'LOW_COVERAGE',
      message: `Only ${applicableWeight}% of the scoring model could be applied (the listing or your profile is missing details), so this score is less reliable.`,
    });
  }
  const eligibility = flags.some((f) => f.severity === 'blocker')
    ? 'blocked'
    : flags.some((f) => f.severity === 'verify')
      ? 'verify'
      : 'clear';

  let label;
  if (eligibility === 'blocked') label = 'critical-gap';
  else if (score >= LABEL_THRESHOLDS.strong && applicableWeight >= MIN_COVERAGE_FOR_STRONG) label = 'strong';
  else if (score >= LABEL_THRESHOLDS.partial) label = 'partial';
  else label = 'weak';

  const match = {
    score,
    label,
    labelText: LABEL_TEXT[label],
    eligibility,
    coverage: applicableWeight, // share (out of 100) of the scoring model that could be applied
    breakdown,
    strengths: evaluated.flatMap((c) => c.strengths),
    gaps: evaluated.flatMap((c) => c.gaps),
    flags,
  };
  match.summary = buildSummary(match);
  return match;
}

/** One- to three-sentence explanation built only from the evaluated evidence. */
export function buildSummary(match) {
  const scored = match.breakdown.filter((c) => c.applicable);
  const strongAreas = scored.filter((c) => c.score >= 0.75).map((c) => c.label.toLowerCase());
  const weakAreas = scored.filter((c) => c.score < 0.5).map((c) => c.label.toLowerCase());

  const parts = [`${match.labelText} (${match.score}/100).`];
  if (strongAreas.length) parts.push(`Strongest on ${listText(strongAreas)}.`);
  if (weakAreas.length) parts.push(`Weaker on ${listText(weakAreas)}.`);

  const blockers = match.flags.filter((f) => f.severity === 'blocker');
  const verify = match.flags.filter((f) => f.severity === 'verify');
  if (blockers.length) parts.push(`Critical gap: ${blockers[0].message}`);
  else if (verify.length) parts.push(`Needs verification: ${verify.map((f) => shortFlag(f)).join('; ')}.`);
  return parts.join(' ');
}

const SHORT_FLAG = {
  WORK_AUTHORISATION_UNKNOWN: 'work authorisation not specified',
  SPONSORSHIP_NEEDED: 'visa sponsorship would be needed',
  ENROLMENT_UNKNOWN: 'enrolment status not specified',
  RESIDENCE_UNKNOWN: 'country of residence not specified',
  LANGUAGE_BELOW_LEVEL: 'language level slightly below requirement',
};
const shortFlag = (f) => SHORT_FLAG[f.code] ?? f.message;

const ELIGIBILITY_ORDER = { clear: 0, verify: 0, blocked: 1 };

/**
 * Rank opportunities for a profile.
 * Order: opportunities with a critical gap go last; then score (desc); then title
 * and id as stable tie-breakers. "Needs verification" does not demote a role because
 * unknown status is common and is shown clearly on every affected card instead.
 */
export function rankOpportunities(profile, opportunities) {
  return opportunities
    .map((opportunity) => ({ opportunity, match: matchOpportunity(profile, opportunity) }))
    .sort(
      (a, b) =>
        ELIGIBILITY_ORDER[a.match.eligibility] - ELIGIBILITY_ORDER[b.match.eligibility] ||
        b.match.score - a.match.score ||
        a.opportunity.title.localeCompare(b.opportunity.title) ||
        a.opportunity.id.localeCompare(b.opportunity.id),
    )
    .map((r, i) => ({ rank: i + 1, ...r }));
}
