import { html, mount } from '../dom.js';
import { avatar, scoreRing, labelPill, metaLine, headline, countryOf, placeText, postedText } from '../format.js';
import { saveButton } from '../main.js';
import { loadJobs, setFilters } from './jobs.js';

const isBlocked = (i) => i.match?.eligibility === 'blocked';

/** Departure-board style list: the user's best fits, or the newest roles without a profile. */
function board(rows, hasProfile) {
  return html`<div class="board" aria-label="${hasProfile ? 'Your top matches' : 'Latest roles'}">
    <div class="board-head">
      <span>${hasProfile ? 'Your top matches' : 'Latest roles'}</span>
      <span class="board-live"><i aria-hidden="true"></i>${hasProfile ? 'ranked by fit' : 'newest first'}</span>
    </div>
    <div class="board-cols" aria-hidden="true"><span>Destination</span><span>Role</span><span>${hasProfile ? 'Fit' : 'Posted'}</span></div>
    <ol class="board-rows">
      ${rows.map(
        ({ opportunity: o, match: m }) => html`<li>
          <a href="#/jobs/${o.id}">
            <span class="board-dest">${o.location.workMode === 'remote' ? 'Remote' : (o.location.city ?? o.location.country)}</span>
            <span class="board-role">${o.title}<small>${o.organisation}</small></span>
            ${m ? html`<span class="board-fit" data-count="${m.score}">${m.score}</span>` : html`<span class="board-date">${postedText(o.postedOn)}</span>`}
          </a>
        </li>`,
      )}
    </ol>
    <a class="board-foot" href="#/jobs">${hasProfile ? 'See all ranked roles' : 'Browse all roles'} →</a>
  </div>`;
}

function pickCard({ opportunity: o, match: m, rank }) {
  const line = m ? headline(m) : null;
  return html`<article class="card pick">
    <header>
      ${avatar(o.organisation)}
      ${m ? scoreRing(m) : ''}
    </header>
    <p class="kicker">${m ? `#${rank} for you` : `Posted ${postedText(o.postedOn)}`}</p>
    <h3><a class="stretched" href="#/jobs/${o.id}">${o.title}</a></h3>
    <p class="org">${o.organisation}</p>
    ${metaLine(o)}
    ${line ? html`<p class="reason reason-${line.tone}">${line.text}</p>` : ''}
    <footer>
      ${m ? labelPill(m) : html`<span class="muted small">${o.salary ?? ''}</span>`}
      ${saveButton(o.id, { compact: true })}
    </footer>
  </article>`;
}

function destinations(items, profile) {
  const preferred = new Set((profile?.preferredLocations ?? []).map((p) => p.toLowerCase()));
  const groups = new Map();
  for (const item of items) {
    const key = countryOf(item.opportunity);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const tiles = [...groups.entries()]
    .map(([country, list]) => ({
      country,
      count: list.length,
      best: Math.max(...list.filter((i) => i.match && !isBlocked(i)).map((i) => i.match.score), -1),
      preferred: preferred.has(country.toLowerCase()),
      cities: [...new Set(list.map((i) => i.opportunity.location.city).filter(Boolean))],
    }))
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.best - a.best || b.count - a.count || a.country.localeCompare(b.country));

  return html`<ul class="dest-grid">
    ${tiles.map(
      (t) => html`<li>
        <button type="button" class="dest ${t.preferred ? 'is-preferred' : ''}" data-country="${t.country}">
          ${t.preferred ? html`<span class="dest-tag">On your list</span>` : ''}
          <strong>${t.country}</strong>
          <span class="dest-cities">${t.cities.join(' · ') || 'Work from anywhere in the region'}</span>
          <span class="dest-foot">
            <span>${t.count} ${t.count === 1 ? 'role' : 'roles'}</span>
            ${t.best >= 0 ? html`<span>best fit <b>${t.best}</b></span>` : ''}
          </span>
        </button>
      </li>`,
    )}
  </ul>`;
}

/** Count a number up once, so the score reads as being worked out rather than just appearing. */
function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((el, index) => {
    const target = Number(el.dataset.count);
    const start = performance.now() + index * 90;
    const duration = 650;
    el.textContent = '0';
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      el.textContent = String(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1 && el.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function renderHomeView(container) {
  const { profile, items } = await loadJobs();
  const open = items.filter((i) => !isBlocked(i));
  const newest = [...items].sort((a, b) => b.opportunity.postedOn.localeCompare(a.opportunity.postedOn));
  const strong = items.filter((i) => i.match?.label === 'strong').length;
  const countries = new Set(items.map((i) => countryOf(i.opportunity))).size;
  const name = profile?.displayName?.trim().split(/\s+/)[0];
  const boardRows = profile ? open.slice(0, 5) : newest.slice(0, 5);
  const picks = profile ? open.slice(0, 3) : newest.slice(0, 3);

  mount(
    container,
    html`<section class="home-hero">
        <div class="container home-hero-inner">
          <div class="home-copy">
            <p class="kicker">${profile ? `Welcome back${name ? `, ${name}` : ''}` : 'International careers, explained'}</p>
            <h1>Find work that <mark>travels</mark> with you.</h1>
            <p class="lede">
              Roles across ${countries} locations, each scored against your profile, with plain reasons, honest gaps and the
              eligibility checks you need before you apply.
            </p>
            <form class="hero-search" id="hero-search" role="search">
              <label class="sr-only" for="hero-q">Search roles</label>
              <input id="hero-q" type="search" placeholder="Role, skill or organisation" autocomplete="off" />
              <label class="sr-only" for="hero-country">Location</label>
              <select id="hero-country">
                <option value="all">Anywhere</option>
                ${[...new Set(items.map((i) => countryOf(i.opportunity)))].sort().map((c) => html`<option value="${c}">${c}</option>`)}
              </select>
              <button type="submit" class="btn btn-primary">Search jobs</button>
            </form>
            <ul class="hero-facts">
              <li><b>${items.length}</b> open roles</li>
              <li><b>${countries}</b> locations</li>
              ${profile ? html`<li><b>${strong}</b> strong fits for you</li>` : html`<li><a href="#/profile">Add your profile</a> to get ranked matches</li>`}
            </ul>
          </div>
          ${board(boardRows, Boolean(profile))}
        </div>
      </section>

      <div class="container page">
        ${profile
          ? ''
          : html`<section class="cta-band">
              <div>
                <h2>See where you actually stand.</h2>
                <p>Tell us your skills, experience and languages. We rank every role by fit and show exactly why.</p>
              </div>
              <a class="btn btn-primary btn-lg" href="#/profile">Create your profile</a>
            </section>`}

        <section aria-labelledby="picks-heading">
          <div class="section-head">
            <div>
              <h2 id="picks-heading">${profile ? 'Top picks for you' : 'Recently posted'}</h2>
              <p class="muted">${profile ? 'Your three best fits right now. Open one to see how the score adds up.' : 'The newest roles on the board.'}</p>
            </div>
            <a class="link-arrow" href="#/jobs">All jobs →</a>
          </div>
          <div class="pick-grid">${picks.map(pickCard)}</div>
        </section>

        <section aria-labelledby="dest-heading">
          <div class="section-head">
            <div>
              <h2 id="dest-heading">Explore by destination</h2>
              <p class="muted">${profile ? 'Your preferred locations come first.' : 'Where the roles are.'}</p>
            </div>
          </div>
          ${destinations(items, profile)}
        </section>

        <section class="how-strip" aria-labelledby="how-heading">
          <h2 id="how-heading">How matching works</h2>
          <ol>
            <li><b>Scored on six things.</b> Skills, experience, education, location, language and career interests, weighted and added up to 100.</li>
            <li><b>Nothing assumed.</b> If a listing does not ask for something it is not scored. If your profile is missing something, it shows as a gap.</li>
            <li><b>Hard requirements stay hard.</b> A missing must-have moves a role to the bottom. An unknown, like work authorisation, is flagged for you to verify.</li>
          </ol>
        </section>
      </div>`,
  );

  container.querySelector('#hero-search').addEventListener('submit', (e) => {
    e.preventDefault();
    setFilters({ q: container.querySelector('#hero-q').value.trim(), country: container.querySelector('#hero-country').value });
    location.hash = '#/jobs';
  });
  container.querySelector('.dest-grid').addEventListener('click', (e) => {
    const tile = e.target.closest('[data-country]');
    if (!tile) return;
    setFilters({ country: tile.dataset.country });
    location.hash = '#/jobs';
  });
  countUp(container);
}
