import { api } from '../api.js';
import { html, mount } from '../dom.js';
import { avatar, scoreRing, labelPill, metaLine, headline, countryOf, postedText, TYPE_LABEL } from '../format.js';
import { saveButton, state } from '../main.js';
import { jobDetail } from './jobDetail.js';

/** Search state. Kept at module level so it survives moving between pages. */
export const filters = { q: '', country: 'all', type: 'all', fit: 'all', sort: 'match' };

export function setFilters(next) {
  Object.assign(filters, { q: '', country: 'all', type: 'all', fit: 'all' }, next);
}

/**
 * Load every role, with the user's match when a profile exists.
 * @returns {{ profile: object|null, items: { opportunity: object, match: object|null, rank: number|null }[] }}
 */
export async function loadJobs() {
  const { profile } = await api.getProfile();
  state.hasProfile = Boolean(profile);
  state.profileName = profile?.displayName ?? '';
  if (profile) {
    const { results } = await api.getMatches();
    return { profile, items: results.map(({ opportunity, match, rank }) => ({ opportunity, match, rank })) };
  }
  const { items } = await api.getOpportunities();
  return { profile: null, items: items.map((opportunity) => ({ opportunity, match: null, rank: null })) };
}

let data = null;

const isBlocked = (item) => item.match?.eligibility === 'blocked';

function visibleItems() {
  const q = filters.q.trim().toLowerCase();
  const list = data.items.filter(({ opportunity: o, match: m }) => {
    if (q) {
      const haystack = [o.title, o.organisation, o.location.city, o.location.country, o.location.region, ...o.requiredSkills, ...o.preferredSkills, ...o.categories]
        .join(' ')
        .toLowerCase();
      if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
    }
    if (filters.country !== 'all' && countryOf(o) !== filters.country) return false;
    if (filters.type !== 'all' && o.type !== filters.type) return false;
    if (filters.fit === 'saved') return state.shortlist.has(o.id);
    if (filters.fit !== 'all') return m?.label === filters.fit;
    return true;
  });
  if (filters.sort === 'match' && data.profile) return list.sort((a, b) => a.rank - b.rank);
  return list.sort((a, b) => b.opportunity.postedOn.localeCompare(a.opportunity.postedOn) || a.opportunity.title.localeCompare(b.opportunity.title));
}

function row({ opportunity: o, match: m, rank }, activeId) {
  const line = m ? headline(m) : null;
  return html`<article class="job-row ${o.id === activeId ? 'active' : ''} ${isBlocked({ match: m }) ? 'is-blocked' : ''}" data-id="${o.id}">
    ${avatar(o.organisation)}
    <div class="job-row-main">
      <h3><a class="stretched" href="#/jobs/${o.id}">${o.title}</a></h3>
      <p class="org">${o.organisation}</p>
      ${metaLine(o)}
      ${line ? html`<p class="reason reason-${line.tone}">${line.text}</p>` : html`<p class="reason reason-neutral">${o.requiredSkills.join(' · ')}</p>`}
      <p class="row-foot">
        ${m ? labelPill(m) : ''}
        ${m?.eligibility === 'verify' ? html`<span class="pill pill-outline">Eligibility to verify</span>` : ''}
        <span class="posted">Posted ${postedText(o.postedOn)}</span>
      </p>
    </div>
    <div class="job-row-side">
      ${m ? scoreRing(m, 'sm') : ''}
      ${m && filters.sort === 'match' ? html`<span class="rank">#${rank}</span>` : ''}
      ${saveButton(o.id, { compact: true })}
    </div>
  </article>`;
}

function listTemplate(items, activeId) {
  if (!items.length) {
    return html`<div class="empty-filter">
      <p><strong>No roles match these filters.</strong></p>
      <button type="button" class="btn btn-secondary" data-reset>Clear filters</button>
    </div>`;
  }
  // When ranked by fit, roles with an unmet hard requirement sit below a divider.
  if (filters.sort === 'match' && data.profile) {
    const open = items.filter((i) => !isBlocked(i));
    const blocked = items.filter(isBlocked);
    return html`${open.map((i) => row(i, activeId))}
      ${blocked.length
        ? html`<div class="list-divider" role="separator">
            <strong>Hard requirement not met</strong>
            <span>Ranked last whatever the score, because a stated must-have is missing from your profile.</span>
          </div>`
        : ''}
      ${blocked.map((i) => row(i, activeId))}`;
  }
  return html`${items.map((i) => row(i, activeId))}`;
}

const chip = (value, label, count) =>
  html`<button type="button" class="chip-btn ${filters.fit === value ? 'active' : ''}" data-fit="${value}" aria-pressed="${String(filters.fit === value)}">
    ${label}${count != null ? html` <span>${count}</span>` : ''}
  </button>`;

function pageTemplate() {
  const countries = [...new Set(data.items.map((i) => countryOf(i.opportunity)))].sort();
  const types = [...new Set(data.items.map((i) => i.opportunity.type))];
  const count = (label) => data.items.filter((i) => i.match?.label === label).length;
  const verify = data.items.filter((i) => i.match?.eligibility === 'verify').length;
  const opt = (value, label, current) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;

  return html`<div class="jobs" id="jobs-root">
    <div class="searchbar">
      <div class="container searchbar-inner">
        <div class="search-field">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></svg>
          <label class="sr-only" for="q">Search roles</label>
          <input id="q" type="search" placeholder="Search roles, skills or organisations" value="${filters.q}" autocomplete="off" />
        </div>
        <label class="sr-only" for="f-country">Location</label>
        <select id="f-country">
          ${opt('all', 'All locations', filters.country)}
          ${countries.map((c) => opt(c, c, filters.country))}
        </select>
        <label class="sr-only" for="f-type">Job type</label>
        <select id="f-type">
          ${opt('all', 'All job types', filters.type)}
          ${types.map((t) => opt(t, TYPE_LABEL[t], filters.type))}
        </select>
        <label class="sr-only" for="f-sort">Sort by</label>
        <select id="f-sort">
          ${data.profile ? opt('match', 'Sort: best fit', filters.sort) : ''}
          ${opt('newest', 'Sort: newest', data.profile ? filters.sort : 'newest')}
        </select>
      </div>
    </div>

    <div class="container jobs-body">
      <section class="job-list-col" aria-label="Search results">
        <div class="list-head">
          <p class="result-count" id="result-count" aria-live="polite"></p>
          <div class="filters" role="group" aria-label="Filter by fit">
            ${chip('all', 'All')}
            ${data.profile ? html`${chip('strong', 'Strong fit', count('strong'))} ${chip('partial', 'Partial', count('partial'))}` : ''}
            ${chip('saved', 'Saved')}
          </div>
        </div>
        ${data.profile
          ? verify
            ? html`<p class="notice">
                <strong>${verify} ${verify === 1 ? 'role needs' : 'roles need'} an eligibility check.</strong>
                Usually because your work authorisation is not specified. These are prompts to verify, not legal determinations.
              </p>`
            : ''
          : html`<a class="notice notice-cta" href="#/profile">
              <strong>See how you fit each role.</strong> Add your profile to rank these jobs by fit, with reasons. →
            </a>`}
        <div class="job-list" id="job-list"></div>
      </section>
      <section class="job-pane" id="job-pane" aria-label="Job details" aria-live="polite"></section>
    </div>
  </div>`;
}

/**
 * Jobs: search and filters, a ranked list, and the selected role beside it.
 * `id` is set when a role is opened directly (`#/jobs/<id>`); on a phone that shows
 * the role full-screen with a back link.
 */
export async function renderJobsView(container, id) {
  const root = container.querySelector('#jobs-root');
  if (root && data) {
    // Already on this page: only switch the selected role, keeping the list's scroll position.
    select(container, id);
    return { keepScroll: true };
  }

  data = await loadJobs();
  if (!data.profile && filters.sort === 'match') filters.sort = 'newest';
  if (data.profile && !['match', 'newest'].includes(filters.sort)) filters.sort = 'match';
  mount(container, pageTemplate());

  const refresh = () => {
    renderList(container);
    // If the open role was filtered out, show the first result instead.
    const shown = visibleItems();
    const current = container.querySelector('#job-pane').dataset.id;
    if (!container.querySelector('#jobs-root').classList.contains('has-selection') && !shown.some((i) => i.opportunity.id === current)) {
      showInPane(container, shown[0]?.opportunity.id ?? null);
    }
  };

  container.querySelector('#q').addEventListener('input', (e) => {
    filters.q = e.target.value;
    refresh();
  });
  container.querySelector('#f-country').addEventListener('change', (e) => {
    filters.country = e.target.value;
    refresh();
  });
  container.querySelector('#f-type').addEventListener('change', (e) => {
    filters.type = e.target.value;
    refresh();
  });
  container.querySelector('#f-sort').addEventListener('change', (e) => {
    filters.sort = e.target.value;
    refresh();
  });
  container.querySelector('.jobs').addEventListener('click', (e) => {
    const fit = e.target.closest('[data-fit]');
    if (fit) {
      filters.fit = fit.dataset.fit;
      container.querySelectorAll('[data-fit]').forEach((b) => {
        b.classList.toggle('active', b === fit);
        b.setAttribute('aria-pressed', String(b === fit));
      });
      return refresh();
    }
    if (e.target.closest('[data-reset]')) {
      setFilters({});
      container.querySelector('#q').value = '';
      container.querySelector('#f-country').value = 'all';
      container.querySelector('#f-type').value = 'all';
      container.querySelectorAll('[data-fit]').forEach((b) => {
        b.classList.toggle('active', b.dataset.fit === 'all');
        b.setAttribute('aria-pressed', String(b.dataset.fit === 'all'));
      });
      refresh();
    }
  });
  // Keep the "Saved" filter accurate when a role is saved or unsaved from this page.
  const onShortlistChange = () => {
    if (!container.querySelector('#jobs-root')) return document.removeEventListener('shortlist:changed', onShortlistChange);
    if (filters.fit === 'saved') refresh();
  };
  document.addEventListener('shortlist:changed', onShortlistChange);

  select(container, id);
  return undefined;
}

function renderList(container) {
  const items = visibleItems();
  const activeId = container.querySelector('#job-pane').dataset.id;
  mount(container.querySelector('#job-list'), listTemplate(items, activeId));
  const sorted = filters.sort === 'match' && data.profile ? 'ranked by fit' : 'newest first';
  container.querySelector('#result-count').textContent = `${items.length} ${items.length === 1 ? 'role' : 'roles'}, ${sorted}`;
}

function showInPane(container, id) {
  const pane = container.querySelector('#job-pane');
  const item = id ? data.items.find((i) => i.opportunity.id === id) : null;
  pane.dataset.id = item ? id : '';
  if (item) {
    mount(pane, jobDetail(item));
  } else {
    mount(pane, html`<div class="pane-empty"><p class="muted">${id ? 'That role could not be found.' : 'Select a role to see the details.'}</p></div>`);
  }
  pane.scrollTop = 0;
  container.querySelectorAll('.job-row').forEach((el) => el.classList.toggle('active', el.dataset.id === pane.dataset.id));
}

/** Show a role in the pane. Without an id, the first visible role is previewed. */
function select(container, id) {
  container.querySelector('#jobs-root').classList.toggle('has-selection', Boolean(id));
  const first = visibleItems()[0]?.opportunity.id ?? null;
  showInPane(container, id || container.querySelector('#job-pane').dataset.id || first);
  renderList(container);
  if (id && matchMedia('(max-width: 960px)').matches) window.scrollTo(0, 0);
  // Opened from a link: make sure the matching row is visible in the list.
  else if (id) container.querySelector('.job-row.active')?.scrollIntoView({ block: 'nearest' });
}
