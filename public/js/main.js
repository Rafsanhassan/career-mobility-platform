import { api, ApiError } from './api.js';
import { html, mount, toast } from './dom.js';
import { initials } from './format.js';
import { renderHomeView } from './views/home.js';
import { renderJobsView } from './views/jobs.js';
import { renderSavedView } from './views/saved.js';
import { renderProfileView } from './views/profile.js';

/**
 * Client-side app state shared by the views. The server is the source of truth;
 * this only caches what the header and the save buttons need to stay in sync.
 */
export const state = {
  shortlist: new Set(),
  hasProfile: false,
  profileName: '',
};

const main = document.getElementById('main');

export async function refreshShortlist() {
  const { items } = await api.getShortlist();
  state.shortlist = new Set(items.map((i) => i.opportunityId));
  updateBadge();
  return items;
}

function updateBadge(bump = false) {
  const badge = document.getElementById('shortlist-count');
  badge.textContent = String(state.shortlist.size);
  badge.hidden = state.shortlist.size === 0;
  if (bump) replay(badge, 'bump');
}

/** Restart a one-shot CSS animation class on an element. */
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Header link: "Create profile" until a profile exists, then the user's initials. */
export function syncProfileLink() {
  const link = document.getElementById('profile-link');
  if (!state.hasProfile) {
    link.textContent = 'Create profile';
    link.classList.remove('has-profile');
    return;
  }
  link.classList.add('has-profile');
  mount(link, html`<span class="me" aria-hidden="true">${initials(state.profileName || 'You')}</span><span>Profile</span>`);
}

/* ------------------------------------------------------------ save / unsave */

const pending = new Set();

/**
 * Save / unsave with an optimistic update that is rolled back if the server call fails.
 * Returns the new saved state.
 */
export async function toggleShortlist(id) {
  // Ignore clicks while a request for this id is in flight, so add/remove can never race.
  if (pending.has(id)) return state.shortlist.has(id);
  pending.add(id);
  const wasSaved = state.shortlist.has(id);
  wasSaved ? state.shortlist.delete(id) : state.shortlist.add(id);
  updateBadge(!wasSaved);
  syncSaveButtons(id, !wasSaved);
  try {
    if (wasSaved) await api.removeFromShortlist(id);
    else await api.addToShortlist(id);
    toast(wasSaved ? 'Removed from saved jobs' : 'Saved', 'success');
  } catch (err) {
    // 404 on remove means it is already gone: keep the optimistic state.
    if (!(wasSaved && err instanceof ApiError && err.status === 404)) {
      wasSaved ? state.shortlist.add(id) : state.shortlist.delete(id);
      updateBadge();
      syncSaveButtons(id, false);
      toast(`Could not update your saved jobs: ${err.message}`, 'error');
    }
  } finally {
    pending.delete(id);
  }
  document.dispatchEvent(new CustomEvent('shortlist:changed', { detail: { id } }));
  return state.shortlist.has(id);
}

const BOOKMARK = html`<svg class="bm" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.500h11v17l-5.5-3.8-5.5 3.800z" /></svg>`;

/** Save button. `compact` renders the icon only (used in dense lists). */
export function saveButton(id, { compact = false } = {}) {
  const saved = state.shortlist.has(id);
  return html`<button
    type="button"
    class="btn btn-save ${compact ? 'btn-icon' : ''} ${saved ? 'is-saved' : ''}"
    data-save="${id}"
    aria-pressed="${String(saved)}"
    aria-label="${saved ? 'Remove from saved jobs' : 'Save job'}"
  >
    ${BOOKMARK}<span class="${compact ? 'sr-only' : ''}" data-save-label>${saved ? 'Saved' : 'Save'}</span>
  </button>`;
}

function syncSaveButtons(id, justSaved) {
  const saved = state.shortlist.has(id);
  document.querySelectorAll(`[data-save="${CSS.escape(id)}"]`).forEach((btn) => {
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', String(saved));
    btn.setAttribute('aria-label', saved ? 'Remove from saved jobs' : 'Save job');
    btn.querySelector('[data-save-label]').textContent = saved ? 'Saved' : 'Save';
    if (justSaved) replay(btn, 'just-saved');
  });
}

// One delegated handler for every save button, wherever it is rendered.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-save]');
  if (!btn) return;
  e.preventDefault();
  const saved = await toggleShortlist(btn.dataset.save);
  if (!saved && location.hash === '#/saved') route();
});

// Theme toggle: follows the system setting until the user picks one.
document.getElementById('theme-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Storage unavailable: the choice simply lasts for this page view.
  }
});

/* ------------------------------------------------------------------ routing */

export function renderError(err) {
  mount(
    main,
    html`<div class="container">
      <section class="panel empty">
        <h1>Something went wrong</h1>
        <p class="muted">${err.message}</p>
        <p><a class="btn btn-primary" href="#/">Back to Discover</a></p>
      </section>
    </div>`,
  );
}

const routes = [
  { pattern: /^#?\/?$/, nav: 'home', view: renderHomeView },
  { pattern: /^#\/jobs$/, nav: 'jobs', view: renderJobsView },
  { pattern: /^#\/jobs\/([\w-]+)$/, nav: 'jobs', view: renderJobsView },
  { pattern: /^#\/saved$/, nav: 'saved', view: renderSavedView },
  { pattern: /^#\/profile$/, nav: 'profile', view: renderProfileView },
];

let routeToken = 0; // id of the latest navigation
let renderedToken = 0; // id of the latest navigation whose view finished rendering

export async function route() {
  const token = ++routeToken;
  const hash = location.hash || '#/';
  // Addresses from the earlier page structure still work.
  const legacy = { '#/matches': '#/jobs', '#/opportunities': '#/jobs', '#/shortlist': '#/saved' }[hash] ?? hash.replace(/^#\/opportunity\//, '#/jobs/');
  if (legacy !== hash) {
    location.replace(legacy);
    return;
  }
  const match = routes.map((r) => ({ r, m: hash.match(r.pattern) })).find((x) => x.m);
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const active = match?.r.nav === a.dataset.nav;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (!match) {
    mount(
      main,
      html`<div class="container"><section class="panel empty"><h1>Page not found</h1><p><a class="btn btn-primary" href="#/">Back to Discover</a></p></section></div>`,
    );
    return;
  }
  try {
    // A view may return { keepScroll: true } when it only updated part of the page in place.
    const result = await match.r.view(main, ...match.m.slice(1));
    if (token !== routeToken) {
      // A view for an earlier URL finished after the current one and overwrote it:
      // render the current URL again. If the current view is still loading, it will
      // overwrite this stale content itself when it finishes.
      if (renderedToken === routeToken) route();
      return;
    }
    renderedToken = token;
    syncProfileLink();
    if (!result?.keepScroll) {
      main.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  } catch (err) {
    if (token === routeToken) renderError(err);
  }
}

async function init() {
  try {
    const [{ profile }] = await Promise.all([api.getProfile(), refreshShortlist()]);
    state.hasProfile = Boolean(profile);
    state.profileName = profile?.displayName ?? '';
  } catch (err) {
    renderError(err);
    return;
  }
  syncProfileLink();
  window.addEventListener('hashchange', route);
  route();
}

init();
