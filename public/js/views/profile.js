import { api, ApiError } from '../api.js';
import { html, mount, toast } from '../dom.js';
import { EDUCATION_OPTIONS, LANGUAGE_LEVELS } from '../format.js';
import { state, syncProfileLink } from '../main.js';
import { filters, setFilters } from './jobs.js';

/* ------------------------------------------------------------ tag inputs */

const SUGGESTIONS = {
  skills: ['Excel', 'reporting', 'research', 'project coordination', 'stakeholder communication', 'data analysis', 'presentation', 'SQL', 'customer support', 'content writing', 'process documentation', 'project scheduling'],
  areas: ['business operations', 'project support', 'programme support', 'customer support', 'research', 'data analysis', 'marketing', 'logistics'],
  locations: ['Germany', 'Canada', 'Singapore', 'United Kingdom', 'Netherlands', 'Australia', 'United States', 'Switzerland', 'Europe', 'Asia', 'North America'],
  interests: ['programme support', 'business operations', 'project coordination', 'business analysis', 'research', 'data analysis', 'marketing', 'customer support'],
  authCountries: ['Bangladesh', 'Germany', 'Canada', 'Singapore', 'United Kingdom', 'United States', 'Australia', 'India'],
};

const splitList = (value) =>
  String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function tagChip(value) {
  return html`<span class="tag" data-tag="${value}">${value}<button type="button" class="tag-x" aria-label="Remove ${value}">×</button></span>`;
}

function tagField({ id, label, hint = '', required = false, values = [], placeholder = '', errorPath, disabled = false }) {
  return html`<div class="field">
    <label for="${id}">${label} ${required ? html`<span class="req">*</span>` : ''} ${hint ? html`<span class="hint">${hint}</span>` : ''}</label>
    <div class="tags ${disabled ? 'is-disabled' : ''}" data-tags="${id}">
      ${values.map(tagChip)}
      <input id="${id}" type="text" autocomplete="off" list="${id}-list" placeholder="${placeholder}" maxlength="60" ${disabled ? 'disabled' : ''} />
    </div>
    <datalist id="${id}-list">${(SUGGESTIONS[id] ?? []).map((s) => html`<option value="${s}"></option>`)}</datalist>
    ${errorSlot(errorPath)}
  </div>`;
}

const tagBox = (form, id) => form.querySelector(`[data-tags="${id}"]`);

/** Current tags in a tag input, including any text typed but not yet confirmed. */
function readTags(form, id) {
  const box = tagBox(form, id);
  const chips = [...box.querySelectorAll('[data-tag]')].map((t) => t.dataset.tag);
  const seen = new Set(chips.map((c) => c.toLowerCase()));
  for (const extra of splitList(box.querySelector('input').value)) {
    if (!seen.has(extra.toLowerCase())) {
      chips.push(extra);
      seen.add(extra.toLowerCase());
    }
  }
  return chips;
}

/** Turn the typed text of a tag input into chips. */
function commitTags(box) {
  const input = box.querySelector('input');
  const existing = new Set([...box.querySelectorAll('[data-tag]')].map((t) => t.dataset.tag.toLowerCase()));
  for (const value of splitList(input.value)) {
    if (existing.has(value.toLowerCase())) continue;
    existing.add(value.toLowerCase());
    const holder = document.createElement('span');
    holder.innerHTML = tagChip(value.slice(0, 60)).value;
    box.insertBefore(holder.firstElementChild, input);
  }
  input.value = '';
}

/* ------------------------------------------------------------------ form */

function languageRow(lang = { language: '', level: 'professional' }, index) {
  return html`<div class="lang-row" data-lang-row>
    <label class="sr-only" for="lang-${index}">Language</label>
    <input id="lang-${index}" name="language" type="text" placeholder="e.g. English" value="${lang.language}" maxlength="60" />
    <label class="sr-only" for="lang-level-${index}">Level</label>
    <select id="lang-level-${index}" name="level">
      ${LANGUAGE_LEVELS.map((l) => html`<option value="${l}" ${l === lang.level ? 'selected' : ''}>${l[0].toUpperCase() + l.slice(1)}</option>`)}
    </select>
    <button type="button" class="icon-btn icon-btn-plain" data-remove-lang aria-label="Remove language">×</button>
  </div>`;
}

function errorSlot(path) {
  return html`<p class="field-error" data-error-for="${path}" hidden></p>`;
}

const section = (num, title, sub, body) => html`<fieldset class="panel form-section">
  <legend><span class="num">${num}</span><span><strong>${title}</strong><small>${sub}</small></span></legend>
  ${body}
</fieldset>`;

function pageTemplate(p) {
  const auth = p.workAuthorisation ?? { status: 'unknown', countries: [] };
  const known = auth.status === 'specified';
  return html`
    <div class="container page">
      <section class="page-head page-head-split">
        <div>
          <p class="kicker">Your profile</p>
          <h1>${state.hasProfile ? 'Keep your profile sharp' : 'Tell us about your career'}</h1>
          <p class="muted">
            Every role is scored against what you enter here. Anything you leave blank is shown as missing information,
            never assumed.
          </p>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary" id="load-sample">Load sample profile</button>
          ${state.hasProfile ? html`<button type="button" class="btn btn-ghost" id="clear-profile">Clear saved profile</button>` : ''}
        </div>
      </section>
    </div>

    <div class="container profile-layout">
      <form id="profile-form" class="form" novalidate>
        <div class="form-error" id="form-error" role="alert" hidden></div>

        ${section(
          1,
          'About you',
          'Optional, used for greetings and residence checks',
          html`<div class="grid-2">
            <div class="field">
              <label for="displayName">Display name</label>
              <input id="displayName" name="displayName" type="text" maxlength="80" value="${p.displayName}" />
              ${errorSlot('displayName')}
            </div>
            <div class="field">
              <label for="currentCountry">Country of residence</label>
              <input id="currentCountry" name="currentCountry" type="text" maxlength="60" value="${p.currentCountry}" />
              ${errorSlot('currentCountry')}
            </div>
          </div>`,
        )}

        ${section(
          2,
          'Education',
          'Your highest qualification',
          html`<div class="grid-3">
            <div class="field">
              <label for="eduLevel">Highest level</label>
              <select id="eduLevel" name="eduLevel">
                ${EDUCATION_OPTIONS.map(([v, l]) => html`<option value="${v}" ${v === (p.education?.level ?? '') ? 'selected' : ''}>${l}</option>`)}
              </select>
              ${errorSlot('education.level')}
            </div>
            <div class="field">
              <label for="eduField">Field of study</label>
              <input id="eduField" name="eduField" type="text" maxlength="100" placeholder="e.g. Business Administration" value="${p.education?.field}" />
              ${errorSlot('education.field')}
            </div>
            <div class="field">
              <label for="eduEnrolled">Currently a student?</label>
              <select id="eduEnrolled" name="eduEnrolled">
                ${[['unknown', 'Not specified'], ['yes', 'Yes'], ['no', 'No']].map(
                  ([v, l]) => html`<option value="${v}" ${v === (p.education?.currentlyEnrolled ?? 'unknown') ? 'selected' : ''}>${l}</option>`,
                )}
              </select>
            </div>
          </div>`,
        )}

        ${section(
          3,
          'Experience',
          'How long you have worked, and in what',
          html`<div class="grid-years">
              <div class="field">
                <label for="years">Years of work experience</label>
                <input id="years" name="years" type="number" min="0" max="60" step="0.5" inputmode="decimal" value="${p.experience?.totalYears ?? ''}" />
                ${errorSlot('experience.totalYears')}
              </div>
              ${tagField({ id: 'areas', label: 'Experience areas', values: p.experience?.areas, placeholder: 'Type and press Enter', errorPath: 'experience.areas' })}
            </div>
            <div class="field">
              <label for="summary">Short summary <span class="hint">optional</span></label>
              <textarea id="summary" name="summary" rows="2" maxlength="1000">${p.experience?.summary}</textarea>
            </div>`,
        )}

        ${section(
          4,
          'Skills and languages',
          'The biggest part of your match score',
          html`${tagField({ id: 'skills', label: 'Skills', required: true, values: p.skills, placeholder: 'Type a skill and press Enter', errorPath: 'skills' })}
            <div class="field">
              <span class="label">Languages <span class="req">*</span></span>
              <div id="lang-rows">${(p.languages?.length ? p.languages : [undefined]).map((l, i) => languageRow(l, i))}</div>
              <button type="button" class="btn btn-ghost btn-sm" id="add-lang">+ Add language</button>
              ${errorSlot('languages')}
            </div>`,
        )}

        ${section(
          5,
          'Preferences',
          'Where you want to work, and on what',
          html`<div class="grid-2">
              ${tagField({ id: 'locations', label: 'Preferred countries or regions', values: p.preferredLocations, placeholder: 'e.g. Germany', errorPath: 'preferredLocations' })}
              ${tagField({ id: 'interests', label: 'Career interests', values: p.careerInterests, placeholder: 'e.g. business operations', errorPath: 'careerInterests' })}
            </div>
            <label class="check"><input type="checkbox" id="remote" ${p.openToRemote ? 'checked' : ''} /> Open to remote roles</label>`,
        )}

        ${section(
          6,
          'Work authorisation',
          'Used only to flag roles that need checking',
          html`<p class="hint">We never treat an unknown status as confirmed, and nothing here is a legal determination.</p>
            <div class="segmented" role="radiogroup" aria-label="Work authorisation status">
              <label><input type="radio" name="authStatus" value="unknown" ${known ? '' : 'checked'} /><span>Not specified</span></label>
              <label><input type="radio" name="authStatus" value="specified" ${known ? 'checked' : ''} /><span>I can already work in…</span></label>
            </div>
            ${tagField({ id: 'authCountries', label: 'Countries you can work in', values: auth.countries, placeholder: 'e.g. Bangladesh', errorPath: 'workAuthorisation.countries', disabled: !known })}`,
        )}

        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-lg" id="save-btn">Save and see my matches</button>
          <span class="muted small">Fields marked <span class="req">*</span> are required.</span>
        </div>
      </form>

      <aside class="panel strength" aria-label="Profile strength">
        <h2>Profile strength</h2>
        <div class="strength-top">
          <div class="ring ring-lg tone-accent" id="strength-ring" role="img" aria-label="Profile completeness">
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle class="ring-bg" cx="22" cy="22" r="19" />
              <circle class="ring-fg" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 22 22)" />
            </svg>
            <span class="ring-num" id="strength-num">0%</span>
          </div>
          <p class="muted small" id="strength-text"></p>
        </div>
        <ul class="checklist" id="strength-list"></ul>
        <p class="muted small">A fuller profile means more of each role can be scored, so results are more reliable.</p>
      </aside>
    </div>`;
}

function readForm(form) {
  const years = form.years.value.trim();
  const authStatus = form.querySelector('input[name="authStatus"]:checked').value;
  return {
    displayName: form.displayName.value.trim(),
    currentCountry: form.currentCountry.value.trim(),
    education: {
      level: form.eduLevel.value || null,
      field: form.eduField.value.trim(),
      currentlyEnrolled: form.eduEnrolled.value,
    },
    experience: {
      totalYears: years === '' ? null : Number(years),
      areas: readTags(form, 'areas'),
      summary: form.summary.value.trim(),
    },
    skills: readTags(form, 'skills'),
    languages: [...form.querySelectorAll('[data-lang-row]')]
      .map((row) => ({ language: row.querySelector('[name="language"]').value.trim(), level: row.querySelector('[name="level"]').value }))
      .filter((l) => l.language),
    preferredLocations: readTags(form, 'locations'),
    openToRemote: form.querySelector('#remote').checked,
    careerInterests: readTags(form, 'interests'),
    workAuthorisation: {
      status: authStatus,
      countries: authStatus === 'specified' ? readTags(form, 'authCountries') : [],
    },
  };
}

/** Quick client-side checks for instant feedback; the server re-validates everything. */
function clientValidate(profile) {
  const issues = [];
  if (!profile.skills.length) issues.push({ path: 'skills', message: 'Add at least one skill' });
  if (!profile.languages.length) issues.push({ path: 'languages', message: 'Add at least one language' });
  const y = profile.experience.totalYears;
  if (y !== null && (!Number.isFinite(y) || y < 0 || y > 60)) {
    issues.push({ path: 'experience.totalYears', message: 'Enter a number between 0 and 60' });
  }
  if (profile.workAuthorisation.status === 'specified' && !profile.workAuthorisation.countries.length) {
    issues.push({ path: 'workAuthorisation.countries', message: 'List at least one country, or choose "Not specified"' });
  }
  return issues;
}

function showIssues(form, issues) {
  form.querySelectorAll('[data-error-for]').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  const formError = form.querySelector('#form-error');
  formError.hidden = !issues.length;
  formError.textContent = issues.length ? 'Please fix the highlighted fields.' : '';

  let first;
  for (const issue of issues) {
    // Match the most specific error slot available (e.g. "languages.0.language" -> "languages").
    const parts = issue.path.split('.');
    let slot;
    while (parts.length && !slot) {
      slot = form.querySelector(`[data-error-for="${parts.join('.')}"]`);
      parts.pop();
    }
    if (!slot) {
      formError.textContent += ` ${issue.message}.`;
      continue;
    }
    slot.hidden = false;
    slot.textContent = slot.textContent ? `${slot.textContent} ${issue.message}.` : `${issue.message}.`;
    first ??= slot;
  }
  (first ?? formError).scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* -------------------------------------------------------- profile strength */

function updateStrength(container, form) {
  const p = readForm(form);
  const items = [
    ['Skills', p.skills.length > 0, true],
    ['Languages', p.languages.length > 0, true],
    ['Education level and field', Boolean(p.education.level && p.education.field), false],
    ['Years of experience', p.experience.totalYears !== null, false],
    ['Experience areas', p.experience.areas.length > 0, false],
    ['Preferred locations', p.preferredLocations.length > 0, false],
    ['Career interests', p.careerInterests.length > 0, false],
  ];
  const done = items.filter(([, ok]) => ok).length;
  const pct = Math.round((100 * done) / items.length);
  container.querySelector('#strength-ring .ring-fg').setAttribute('stroke-dasharray', `${pct} 100`);
  container.querySelector('#strength-num').textContent = `${pct}%`;
  container.querySelector('#strength-text').textContent =
    pct === 100 ? 'Everything the matcher uses is filled in.' : `${done} of ${items.length} sections that affect your score are filled in.`;
  const authNote = p.workAuthorisation.status === 'specified' ? 'Work authorisation: self-reported' : 'Work authorisation: not specified (roles will be flagged to verify)';
  mount(
    container.querySelector('#strength-list'),
    html`${items.map(([label, ok, required]) => html`<li class="${ok ? 'ok' : ''}"><span aria-hidden="true">${ok ? '✓' : '○'}</span>${label}${required && !ok ? html` <em>required</em>` : ''}</li>`)}
      <li class="neutral"><span aria-hidden="true">i</span>${authNote}</li>`,
  );
}

/* ------------------------------------------------------------------ wiring */

function emptyProfile() {
  return {
    displayName: '',
    currentCountry: '',
    education: { level: null, field: '', currentlyEnrolled: 'unknown' },
    experience: { totalYears: null, areas: [], summary: '' },
    skills: [],
    languages: [],
    preferredLocations: [],
    openToRemote: false,
    careerInterests: [],
    workAuthorisation: { status: 'unknown', countries: [] },
  };
}

function render(container, profile) {
  mount(container, pageTemplate(profile));
  bind(container);
}

function bind(container) {
  const form = container.querySelector('#profile-form');
  const refresh = () => updateStrength(container, form);

  // Tag inputs: Enter or comma adds a tag, Backspace on an empty box removes the last one.
  form.addEventListener('keydown', (e) => {
    const box = e.target.closest('.tags');
    if (!box || e.target.tagName !== 'INPUT') return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTags(box);
      refresh();
    } else if (e.key === 'Backspace' && !e.target.value) {
      const tags = box.querySelectorAll('[data-tag]');
      if (tags.length) tags[tags.length - 1].remove();
      refresh();
    }
  });
  form.addEventListener('focusout', (e) => {
    const box = e.target.closest('.tags');
    if (box && e.target.tagName === 'INPUT' && e.target.value.trim()) {
      commitTags(box);
      refresh();
    }
  });
  form.addEventListener('click', (e) => {
    const remove = e.target.closest('.tag-x');
    if (remove) {
      const box = remove.closest('.tags');
      remove.closest('[data-tag]').remove();
      box.querySelector('input').focus();
      return refresh();
    }
    const box = e.target.closest('.tags');
    if (box && e.target === box) box.querySelector('input').focus();

    if (e.target.closest('[data-remove-lang]')) {
      const rows = form.querySelector('#lang-rows');
      if (rows.children.length > 1) e.target.closest('[data-lang-row]').remove();
      else rows.querySelector('input').value = '';
      refresh();
    }
  });
  form.addEventListener('input', (e) => {
    // Pasting "a, b, c" into a tag input creates the tags straight away.
    const box = e.target.closest('.tags');
    if (box && e.target.value.includes(',')) commitTags(box);
    refresh();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'authStatus') {
      const enabled = e.target.value === 'specified';
      const box = tagBox(form, 'authCountries');
      box.classList.toggle('is-disabled', !enabled);
      box.querySelector('input').disabled = !enabled;
      if (enabled) box.querySelector('input').focus();
    }
    refresh();
  });

  form.querySelector('#add-lang').addEventListener('click', () => {
    const rows = form.querySelector('#lang-rows');
    const holder = document.createElement('div');
    holder.innerHTML = languageRow(undefined, Date.now()).value;
    rows.appendChild(holder.firstElementChild);
    rows.lastElementChild.querySelector('input').focus();
  });

  container.querySelector('#load-sample').addEventListener('click', async () => {
    try {
      const { profile: sample } = await api.getSampleProfile();
      render(container, sample);
      toast('Sample profile loaded. Review it, then save.', 'info');
    } catch (err) {
      toast(`Could not load the sample profile: ${err.message}`, 'error');
    }
  });

  container.querySelector('#clear-profile')?.addEventListener('click', async () => {
    if (!confirm('Clear your saved profile? Your shortlist is kept.')) return;
    try {
      await api.deleteProfile();
    } catch (err) {
      toast(`Could not clear your profile: ${err.message}`, 'error');
      return;
    }
    state.hasProfile = false;
    state.profileName = '';
    syncProfileLink();
    toast('Profile cleared', 'success');
    render(container, emptyProfile());
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('.tags').forEach(commitTags);
    const data = readForm(form);
    const issues = clientValidate(data);
    if (issues.length) return showIssues(form, issues);

    const btn = form.querySelector('#save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await api.saveProfile(data);
      state.hasProfile = true;
      state.profileName = data.displayName;
      // Show the full ranked list, not whatever search was active before.
      setFilters({});
      filters.sort = 'match';
      toast('Profile saved. Ranking your matches…', 'success');
      location.hash = '#/jobs';
    } catch (err) {
      if (err instanceof ApiError && err.issues.length) showIssues(form, err.issues);
      else showIssues(form, [{ path: '_', message: err.message }]);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save and see my matches';
    }
  });

  refresh();
}

export async function renderProfileView(container) {
  const { profile } = await api.getProfile();
  state.hasProfile = Boolean(profile);
  state.profileName = profile?.displayName ?? '';
  render(container, profile ?? emptyProfile());
}
