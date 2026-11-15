import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createApp } from '../src/app.js';
import { sampleProfile, tempDir } from './helpers.js';

let server;
let base;

async function call(method, path, body, raw) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

before(async () => {
  const app = createApp({ storePath: join(tempDir(), 'store.json') });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('End-to-end user journey over the API', () => {
  test('matches require a profile first', async () => {
    const r = await call('GET', '/api/matches');
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'profile_required');
  });

  test('lists at least 10 opportunities', async () => {
    const r = await call('GET', '/api/opportunities');
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length >= 10);
  });

  test('saves a valid profile, then returns ranked, explained matches', async () => {
    const saved = await call('PUT', '/api/profile', sampleProfile());
    assert.equal(saved.status, 200);
    assert.ok(saved.body.profile.updatedAt);

    const r = await call('GET', '/api/matches');
    assert.equal(r.status, 200);
    assert.equal(r.body.results[0].rank, 1);
    assert.equal(r.body.results[0].opportunity.id, 'opp-001');
    for (const item of r.body.results) {
      assert.equal(typeof item.match.score, 'number');
      assert.ok(item.match.summary.length > 0);
    }
  });

  test('returns detail for one match', async () => {
    const r = await call('GET', '/api/matches/opp-003');
    assert.equal(r.status, 200);
    assert.equal(r.body.match.eligibility, 'blocked');
    assert.equal(r.body.opportunity.title, 'German-speaking Client Associate');
  });

  test('shortlist: add, add again (idempotent), list, remove', async () => {
    assert.equal((await call('POST', '/api/shortlist', { opportunityId: 'opp-001' })).status, 201);
    assert.equal((await call('POST', '/api/shortlist', { opportunityId: 'opp-001' })).status, 200);
    const list = await call('GET', '/api/shortlist');
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].opportunity.id, 'opp-001');
    assert.ok(list.body.items[0].match);
    const matches = await call('GET', '/api/matches');
    assert.equal(matches.body.results.find((r) => r.opportunity.id === 'opp-001').shortlisted, true);
    assert.equal((await call('DELETE', '/api/shortlist/opp-001')).status, 204);
    assert.equal((await call('DELETE', '/api/shortlist/opp-001')).status, 404);
  });

  test('shortlist status: mark as applied, reject invalid status and unsaved roles', async () => {
    await call('POST', '/api/shortlist', { opportunityId: 'opp-004' });
    const applied = await call('PATCH', '/api/shortlist/opp-004', { status: 'applied' });
    assert.equal(applied.status, 200);
    assert.equal(applied.body.entry.status, 'applied');
    const list = await call('GET', '/api/shortlist');
    assert.equal(list.body.items.find((i) => i.opportunityId === 'opp-004').status, 'applied');
    assert.equal((await call('PATCH', '/api/shortlist/opp-004', { status: 'hired' })).status, 400);
    assert.equal((await call('PATCH', '/api/shortlist/opp-012', { status: 'applied' })).status, 404);
    await call('DELETE', '/api/shortlist/opp-004');
  });

  test('shortlist rejects unknown opportunities', async () => {
    const r = await call('POST', '/api/shortlist', { opportunityId: 'opp-999' });
    assert.equal(r.status, 404);
  });
});

describe('Validation and errors', () => {
  test('rejects a profile with no skills and no languages, with field paths', async () => {
    const r = await call('PUT', '/api/profile', { ...sampleProfile(), skills: [], languages: [] });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'validation_error');
    const paths = r.body.issues.map((i) => i.path);
    assert.ok(paths.includes('skills'));
    assert.ok(paths.includes('languages'));
  });

  test('rejects invalid values (negative years, unknown language level, unknown field)', async () => {
    const r = await call('PUT', '/api/profile', {
      ...sampleProfile(),
      experience: { totalYears: -1, areas: [] },
      languages: [{ language: 'English', level: 'fluent-ish' }],
      unexpected: true,
    });
    assert.equal(r.status, 400);
    const paths = r.body.issues.map((i) => i.path);
    assert.ok(paths.includes('experience.totalYears'));
    assert.ok(paths.includes('languages.0.level'));
    assert.ok(r.body.issues.some((i) => /unexpected/.test(i.message)));
  });

  test('"specified" work authorisation needs at least one country', async () => {
    const r = await call('PUT', '/api/profile', { ...sampleProfile(), workAuthorisation: { status: 'specified', countries: [] } });
    assert.equal(r.status, 400);
    assert.ok(r.body.issues.some((i) => i.path === 'workAuthorisation.countries'));
  });

  test('malformed JSON returns a clean 400', async () => {
    const r = await call('PUT', '/api/profile', undefined, '{not json');
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid_json');
  });

  test('unknown opportunity returns 404', async () => {
    assert.equal((await call('GET', '/api/opportunities/nope')).status, 404);
  });

  test('stateless /api/match validates and does not store the profile', async () => {
    await call('DELETE', '/api/profile');
    const r = await call('POST', '/api/match', sampleProfile());
    assert.equal(r.status, 200);
    assert.ok(r.body.results.length >= 10);
    assert.equal((await call('GET', '/api/profile')).body.profile, null);
  });

  test('API responses are not cacheable and carry security headers', async () => {
    const r = await call('GET', '/api/profile');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(r.headers.get('content-security-policy'));
  });
});

describe('Data loading', () => {
  test('a malformed opportunity file fails fast with a clear message', () => {
    const dir = tempDir();
    const bad = join(dir, 'opps.json');
    writeFileSync(bad, JSON.stringify([{ id: 'x', title: 'No other fields' }]));
    assert.throws(() => createApp({ opportunitiesPath: bad, storePath: join(dir, 's.json') }), /Invalid opportunity at index 0/);
  });
});
