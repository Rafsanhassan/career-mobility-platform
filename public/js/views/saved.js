import { api } from '../api.js';
import { html, mount, toast } from '../dom.js';
import { avatar, scoreRing, labelPill, eligibilityPill, metaLine, summaryBody, placeText, toneOf } from '../format.js';
import { refreshShortlist, saveButton, route } from '../main.js';

const ELIGIBILITY_TEXT = { clear: 'No issues found', verify: 'To verify', blocked: 'Hard requirement not met' };

/** Side-by-side comparison of the saved roles, one column per role. */
function compareTable(items) {
  const scored = items.filter((i) => i.match);
  if (scored.length < 2) return '';
  const criteria = scored[0].match.breakdown.map((c) => ({ key: c.key, label: c.label }));
  const best = Math.max(...scored.map((i) => i.match.score));
  return html`<section class="panel compare" aria-labelledby="compare-heading">
    <h2 id="compare-heading">Compare side by side</h2>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">Criterion</span></th>
            ${scored.map(({ opportunity: o }) => html`<th scope="col"><a href="#/jobs/${o.id}">${o.title}</a><span>${placeText(o.location)}</span></th>`)}
          </tr>
        </thead>
        <tbody>
          <tr class="row-score">
            <th scope="row">Fit score</th>
            ${scored.map(({ match: m }) => html`<td><strong class="${m.score === best ? 'best' : ''}">${m.score}</strong><span class="muted"> / 100</span></td>`)}
          </tr>
          <tr>
            <th scope="row">Eligibility</th>
            ${scored.map(({ match: m }) => html`<td><span class="elig elig-${m.eligibility}">${ELIGIBILITY_TEXT[m.eligibility]}</span></td>`)}
          </tr>
          ${criteria.map(
            ({ key, label }) => html`<tr>
              <th scope="row">${label}</th>
              ${scored.map(({ match: m }) => {
                const c = m.breakdown.find((b) => b.key === key);
                return c.applicable
                  ? html`<td><span class="meter meter-${toneOf(c.score)}"><span data-width="${c.score * 100}"></span></span><span class="cell-val">${Math.round(c.score * 100)}</span></td>`
                  : html`<td class="muted">Not scored</td>`;
              })}
            </tr>`,
          )}
          <tr>
            <th scope="row">Pay</th>
            ${scored.map(({ opportunity: o }) => html`<td>${o.salary ?? 'Not stated'}</td>`)}
          </tr>
        </tbody>
      </table>
    </div>
  </section>`;
}

function savedCard({ opportunity: o, match: m, savedAt, status }, animate) {
  const applied = status === 'applied';
  const body = m ? summaryBody(m) : '';
  return html`<article class="card saved-card ${m?.eligibility === 'blocked' ? 'is-blocked' : ''}">
    ${avatar(o.organisation)}
    <div class="saved-main">
      <h3><a href="#/jobs/${o.id}">${o.title}</a></h3>
      <p class="org">${o.organisation}</p>
      ${metaLine(o)}
      ${m ? html`<div class="pills">${labelPill(m)} ${eligibilityPill(m)}</div>` : ''}
      ${body ? html`<p class="summary">${body}</p>` : ''}
      <div class="card-actions">
        <a class="btn btn-primary" href="#/jobs/${o.id}">View role</a>
        <button type="button" class="btn btn-secondary" data-apply="${o.id}" data-next="${applied ? 'saved' : 'applied'}">
          ${applied ? 'Undo applied' : 'Mark as applied'}
        </button>
        ${saveButton(o.id, { compact: true })}
        <span class="muted small push">Saved ${new Date(savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
    <div class="saved-side">
      ${m ? scoreRing(m) : ''}
      ${applied ? html`<span class="stamp ${animate ? 'stamp-in' : ''}">Applied</span>` : ''}
    </div>
  </article>`;
}

let justApplied = null;

export async function renderSavedView(container) {
  const items = (await refreshShortlist()).slice().reverse();
  if (!items.length) {
    return mount(
      container,
      html`<div class="container">
        <section class="panel empty">
          <svg class="empty-art" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3.500h11v17l-5.5-3.8-5.5 3.800z" /></svg>
          <h1>Nothing saved yet</h1>
          <p class="muted">Save roles you like and they will wait here, ready to compare side by side.</p>
          <a class="btn btn-primary btn-lg" href="#/jobs">Browse jobs</a>
        </section>
      </div>`,
    );
  }
  const applied = items.filter((i) => i.status === 'applied').length;
  mount(
    container,
    html`<div class="container page">
      <section class="page-head">
        <p class="kicker">Saved jobs</p>
        <h1>Your shortlist</h1>
        <p class="muted">${items.length} saved${applied ? `, ${applied} applied` : ''}. Most recently saved first.</p>
      </section>
      ${compareTable(items)}
      <div class="card-list">${items.map((i) => savedCard(i, i.opportunityId === justApplied))}</div>
    </div>`,
  );
  const keepScroll = justApplied !== null;
  justApplied = null;

  container.querySelector('.card-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-apply]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await api.setShortlistStatus(btn.dataset.apply, btn.dataset.next);
      if (btn.dataset.next === 'applied') justApplied = btn.dataset.apply;
      await route();
    } catch (err) {
      btn.disabled = false;
      toast(`Could not update the status: ${err.message}`, 'error');
    }
  });
  // After "Mark as applied" the page re-renders in place, so keep the reader where they were.
  return keepScroll ? { keepScroll: true } : undefined;
}
