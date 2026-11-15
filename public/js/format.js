import { html } from './dom.js';

export const EDUCATION_OPTIONS = [
  ['', 'Not specified'],
  ['none', 'No formal qualification'],
  ['secondary', 'Secondary school'],
  ['diploma', 'Diploma / associate degree'],
  ['bachelor', "Bachelor's degree"],
  ['master', "Master's degree"],
  ['doctorate', 'Doctorate'],
];
export const EDUCATION_LABEL = Object.fromEntries(EDUCATION_OPTIONS);

export const LANGUAGE_LEVELS = ['basic', 'conversational', 'professional', 'native'];

export const TYPE_LABEL = { job: 'Full-time', internship: 'Internship', contract: 'Contract' };
export const WORK_MODE_LABEL = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };

export const cap = (s) => String(s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());

/** Country used for grouping and filtering; remote roles are grouped under "Remote". */
export const countryOf = (o) => (o.location.workMode === 'remote' ? 'Remote' : o.location.country);

export function placeText(loc) {
  if (loc.workMode === 'remote') return `Remote, ${cap(loc.region ?? 'any region')}`;
  // City-states such as Singapore would otherwise read "Singapore, Singapore".
  return [...new Set([loc.city, loc.country].filter(Boolean))].join(', ');
}

export function locationText(loc) {
  if (loc.workMode === 'remote') return placeText(loc);
  return `${placeText(loc)} · ${WORK_MODE_LABEL[loc.workMode]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-28" -> "28 Oct". Parsed by hand so the result does not depend on the time zone. */
export function postedText(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function experienceText(exp) {
  if (!exp || (exp.minYears == null && exp.maxYears == null)) return 'Not specified';
  if (exp.minYears != null && exp.maxYears != null) return `${exp.minYears}–${exp.maxYears} years`;
  if (exp.minYears != null) return `${exp.minYears}+ years`;
  return `Up to ${exp.maxYears} years`;
}

export function educationText(edu) {
  if (!edu || (!edu.minLevel && !edu.fields?.length)) return 'Not specified';
  const level = edu.minLevel ? `${EDUCATION_LABEL[edu.minLevel]} or higher` : 'Any level';
  return edu.fields?.length ? `${level} in ${edu.fields.join(' / ')}` : `${level}, any field`;
}

export function languagesText(langs) {
  if (!langs?.length) return 'Not specified';
  return langs.map((l) => `${cap(l.level)} ${l.language}${l.required === false ? ' (preferred)' : ''}`).join(', ');
}

export function sponsorshipText(e) {
  return { available: 'Visa sponsorship may be available', not_available: 'No visa sponsorship', unknown: 'Sponsorship not stated' }[
    e.visaSponsorship ?? 'unknown'
  ];
}

/** Up to two initials from a name, skipping bracketed notes and joining words. */
export function initials(name) {
  const words = String(name)
    .replace(/\(.*?\)/g, '')
    .split(/[\s&-]+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return (words[0]?.[0] ?? '?').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase();
}

/** Organisation monogram. The colour is derived from the name, so it is stable. */
export function avatar(name, size = 'md') {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) % 997;
  return html`<span class="avatar avatar-${size} avatar-c${hash % 6}" aria-hidden="true">${initials(name)}</span>`;
}

/** One-line facts under a role title. */
export function metaLine(o) {
  return html`<p class="job-meta">
    <span>${placeText(o.location)}</span><span>${WORK_MODE_LABEL[o.location.workMode]}</span><span>${TYPE_LABEL[o.type]}</span>
  </p>`;
}

/** Circular score gauge. `size` is 'sm' | 'md' | 'lg'. */
export function scoreRing(match, size = 'md') {
  return html`<div class="ring ring-${size} tone-${match.label}" role="img" aria-label="Fit score ${match.score} out of 100">
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle class="ring-bg" cx="22" cy="22" r="19" />
      <circle class="ring-fg" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="${match.score} 100" transform="rotate(-90 22 22)" />
    </svg>
    <span class="ring-num">${match.score}</span>
  </div>`;
}

const LABEL_CLASS = { strong: 'pill-good', partial: 'pill-warn', weak: 'pill-neutral', 'critical-gap': 'pill-bad' };
const LABEL_SHORT = { strong: 'Strong fit', partial: 'Partial fit', weak: 'Weak fit', 'critical-gap': 'Hard requirement not met' };

export function labelPill(match) {
  return html`<span class="pill ${LABEL_CLASS[match.label]}" title="${match.labelText}">${LABEL_SHORT[match.label]}</span>`;
}

export function eligibilityPill(match) {
  // A blocked match already carries the "hard requirement" label pill.
  if (match.eligibility === 'blocked') return '';
  if (match.eligibility === 'verify') return html`<span class="pill pill-outline">Eligibility to verify</span>`;
  return html`<span class="pill pill-good">No eligibility issues found</span>`;
}

/** The engine summary without its leading "Label (score/100)." sentence, which the ring and pill already show. */
export function summaryBody(match) {
  return match.summary.replace(/^[^.]*\(\d+\/100\)\.\s*/, '');
}

/** The single most useful line about a match, for dense lists. */
export function headline(match) {
  const blocker = match.flags.find((f) => f.severity === 'blocker');
  if (blocker) return { tone: 'bad', text: blocker.message.replace(/\s*This is not a legal determination\.$/, '') };
  if (match.strengths.length) return { tone: 'good', text: match.strengths[0] };
  if (match.gaps.length) return { tone: 'neutral', text: match.gaps[0] };
  return null;
}

export const toneOf = (score) => (score >= 0.75 ? 'hi' : score >= 0.4 ? 'mid' : 'lo');

const SHORT_LABEL = { skills: 'Skills', experience: 'Experience', education: 'Education', location: 'Location', language: 'Language', interests: 'Interests' };

/** Compact per-criterion meters: the "shape" of a match at a glance. */
export function fitMeters(match) {
  return html`<ul class="fit" aria-label="Fit by criterion">
    ${match.breakdown.map((c) =>
      c.applicable
        ? html`<li class="fit-item">
            <span class="fit-label">${SHORT_LABEL[c.key]}</span>
            <span class="fit-val">${Math.round(c.score * 100)}</span>
            <span class="meter meter-${toneOf(c.score)}"><span data-width="${c.score * 100}"></span></span>
          </li>`
        : html`<li class="fit-item fit-na" title="${c.note}">
            <span class="fit-label">${SHORT_LABEL[c.key]}</span>
            <span class="fit-val">n/a</span>
            <span class="meter"></span>
          </li>`,
    )}
  </ul>`;
}

const FLAG_TITLE = { blocker: 'Hard requirement not met', verify: 'Verify before applying', info: 'Good to know' };

export function flagList(flags) {
  if (!flags.length) return html`<p class="muted">No eligibility constraints were found for this role.</p>`;
  const order = { blocker: 0, verify: 1, info: 2 };
  return html`<ul class="flags">
    ${[...flags]
      .sort((a, b) => order[a.severity] - order[b.severity])
      .map((f) => html`<li class="flag flag-${f.severity}"><strong>${FLAG_TITLE[f.severity]}</strong><span>${f.message}</span></li>`)}
  </ul>`;
}
