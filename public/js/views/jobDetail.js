import { html } from '../dom.js';
import {
  avatar,
  scoreRing,
  labelPill,
  eligibilityPill,
  flagList,
  fitMeters,
  summaryBody,
  toneOf,
  cap,
  locationText,
  postedText,
  experienceText,
  educationText,
  languagesText,
  sponsorshipText,
  TYPE_LABEL,
} from '../format.js';
import { saveButton } from '../main.js';

const SKILL_TITLE = { met: 'You have this skill', related: 'You have a related skill', missing: 'Not in your profile' };
const SKILL_MARK = { met: '✓', related: '≈', missing: '–' };

function skillChips(list, statuses) {
  if (!list?.length) return html`<span class="muted">None listed</span>`;
  return html`<ul class="chips">
    ${list.map((skill) => {
      const s = statuses?.find((x) => x.skill === skill);
      return html`<li class="chip ${s ? `chip-${s.status}` : ''}" title="${s ? `${SKILL_TITLE[s.status]}${s.via ? ` (${s.via})` : ''}` : ''}">
        ${s ? html`<span class="chip-mark" aria-hidden="true">${SKILL_MARK[s.status]}</span>` : ''}${skill}
        ${s ? html`<span class="sr-only">: ${SKILL_TITLE[s.status]}</span>` : ''}
      </li>`;
    })}
  </ul>`;
}

/** Small coloured dot showing how the profile does on the criterion behind a requirement row. */
function dot(match, key) {
  const c = match?.breakdown.find((b) => b.key === key);
  if (!c) return '';
  if (!c.applicable) return html`<span class="dot dot-na" title="Not scored"></span>`;
  const tone = toneOf(c.score);
  return html`<span class="dot dot-${tone}" title="${{ hi: 'Good fit', mid: 'Partial fit', lo: 'Gap' }[tone]}"></span>`;
}

function requirements(o, match) {
  const e = o.eligibility;
  const skills = match?.breakdown.find((b) => b.key === 'skills')?.details;
  const eligibilityItems = [
    e.workAuthorisationRequired ? `Right to work in ${o.location.country ?? 'the role location'} required` : 'No work-authorisation requirement stated',
    e.workAuthorisationRequired ? sponsorshipText(e) : null,
    e.enrolledStudentRequired ? 'Must be a currently enrolled student' : null,
    e.residenceRegion ? `Must be based in ${cap(e.residenceRegion)}` : null,
    ...(e.otherRequirements ?? []),
  ].filter(Boolean);

  return html`<section class="jd-section">
    <h3>What they are looking for</h3>
    ${skills
      ? html`<p class="legend" aria-hidden="true">
          <span class="chip chip-met"><span class="chip-mark">✓</span>you have it</span>
          <span class="chip chip-related"><span class="chip-mark">≈</span>related skill</span>
          <span class="chip chip-missing"><span class="chip-mark">–</span>not in your profile</span>
        </p>`
      : ''}
    <dl class="req-list">
      <dt>${dot(match, 'skills')}Must-have skills</dt><dd>${skillChips(o.requiredSkills, skills?.required)}</dd>
      <dt>Nice to have</dt><dd>${skillChips(o.preferredSkills, skills?.preferred)}</dd>
      <dt>${dot(match, 'experience')}Experience</dt>
      <dd>${experienceText(o.experience)}${o.experience?.areas?.length ? html` in ${o.experience.areas.join(', ')}` : ''}</dd>
      <dt>${dot(match, 'education')}Education</dt><dd>${educationText(o.education)}</dd>
      <dt>${dot(match, 'language')}Languages</dt><dd>${languagesText(o.languages)}</dd>
      <dt>${dot(match, 'location')}Location</dt><dd>${locationText(o.location)}</dd>
      <dt>Eligibility</dt><dd><ul class="plain">${eligibilityItems.map((i) => html`<li>${i}</li>`)}</ul></dd>
      <dt>${dot(match, 'interests')}Field</dt><dd>${o.categories.map(cap).join(', ')}</dd>
    </dl>
  </section>`;
}

function breakdownRow(c) {
  if (!c.applicable) {
    return html`<li class="crit crit-na">
      <div class="crit-head"><span>${c.label}</span><span>Not scored</span></div>
      <p class="muted small">${c.note}</p>
    </li>`;
  }
  const pct = c.maxPoints ? (100 * c.points) / c.maxPoints : 0;
  return html`<li class="crit">
    <div class="crit-head"><span>${c.label}</span><span><strong>${c.points}</strong> / ${c.maxPoints} pts</span></div>
    <div class="meter meter-lg meter-${toneOf(c.score)}" role="img" aria-label="${c.label}: ${Math.round(pct)}% of available points"><span data-width="${pct}"></span></div>
    ${c.strengths.length ? html`<ul class="ticks small">${c.strengths.map((s) => html`<li>${s}</li>`)}</ul>` : ''}
    ${c.gaps.length ? html`<ul class="crosses small">${c.gaps.map((s) => html`<li>${s}</li>`)}</ul>` : ''}
  </li>`;
}

function fitCard(m) {
  const body = summaryBody(m);
  return html`<section class="fit-card tone-edge-${m.label}" aria-label="Your fit">
    <div class="fit-top">
      ${scoreRing(m, 'lg')}
      <div>
        <p class="kicker">Your fit</p>
        <div class="pills">${labelPill(m)} ${eligibilityPill(m)}</div>
        ${body ? html`<p class="summary">${body}</p>` : ''}
      </div>
    </div>
    ${fitMeters(m)}
    <div class="why">
      ${m.strengths.length ? html`<div><h4>Why it fits</h4><ul class="ticks">${m.strengths.slice(0, 4).map((s) => html`<li>${s}</li>`)}</ul></div>` : ''}
      ${m.gaps.length ? html`<div><h4>Gaps</h4><ul class="crosses">${m.gaps.slice(0, 4).map((s) => html`<li>${s}</li>`)}</ul></div>` : ''}
    </div>
  </section>`;
}

function fitPrompt() {
  return html`<section class="fit-card fit-prompt">
    <div>
      <p class="kicker">Your fit</p>
      <p class="summary">Add your profile to see a fit score for this role, with the reasons and any eligibility checks.</p>
    </div>
    <a class="btn btn-primary" href="#/profile">Create profile</a>
  </section>`;
}

/**
 * Full job detail: header, fit card, description, requirements, eligibility and the
 * score breakdown. Used in the Jobs split view.
 */
export function jobDetail({ opportunity: o, match: m, rank }) {
  return html`<article class="job-detail">
    <a class="back" href="#/jobs">← All jobs</a>
    <header class="jd-head">
      ${avatar(o.organisation, 'lg')}
      <div class="jd-title">
        <p class="org">${o.organisation}</p>
        <h2>${o.title}</h2>
        <ul class="facts-row">
          <li>${locationText(o.location)}</li>
          <li>${TYPE_LABEL[o.type]}</li>
          ${o.salary ? html`<li>${o.salary}</li>` : ''}
          <li>Posted ${postedText(o.postedOn)}</li>
          ${m && rank ? html`<li class="fact-rank">#${rank} of your matches</li>` : ''}
        </ul>
      </div>
      <div class="jd-actions">${saveButton(o.id)}</div>
    </header>

    ${m ? fitCard(m) : fitPrompt()}

    ${m
      ? html`<section class="jd-section">
          <h3>Eligibility and hard requirements</h3>
          ${flagList(m.flags)}
          <p class="disclaimer">
            Based only on your profile and this listing. This is not legal or immigration advice; confirm work-authorisation
            questions with the employer or an official source.
          </p>
        </section>`
      : ''}

    <section class="jd-section">
      <h3>About the role</h3>
      <p class="lead">${o.description}</p>
    </section>

    ${requirements(o, m)}

    ${m
      ? html`<details class="jd-section breakdown-wrap">
          <summary><h3>How this score adds up</h3></summary>
          ${m.coverage < 100 ? html`<p class="muted small">Some criteria do not apply to this role, so the remaining ones were rescaled to 100 points.</p>` : ''}
          <ul class="breakdown">${m.breakdown.map(breakdownRow)}</ul>
          <p class="muted small">
            Scores weigh skills (35), experience (20), education (15), location (10), language (10) and career interests (10).
            A requirement the listing does not state is left out. Hard requirements never add points: an unmet one moves the
            role below all others, and an unknown one is flagged for you to verify.
          </p>
        </details>`
      : ''}
  </article>`;
}
