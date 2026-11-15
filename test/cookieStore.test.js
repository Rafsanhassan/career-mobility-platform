import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { cookieStoreFactory } from '../src/data/cookieStore.js';
import { sampleProfile } from './helpers.js';

let server;
let base;

/** A minimal browser: remembers the cookie the server sets and sends it back. */
function visitor() {
  let cookie = '';
  return {
    setCookie: (value) => {
      cookie = value;
    },
    async call(method, path, body) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, setCookie: set };
    },
  };
}

before(async () => {
  const app = createApp({ storeFactory: cookieStoreFactory({ secure: false }) });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('Hosted demo mode (per-visitor cookie store)', () => {
  test('full journey works with state carried in the cookie', async () => {
    const v = visitor();
    assert.equal((await v.call('GET', '/api/matches')).status, 409);

    const saved = await v.call('PUT', '/api/profile', sampleProfile());
    assert.equal(saved.status, 200);
    assert.match(saved.setCookie, /HttpOnly/);
    assert.match(saved.setCookie, /SameSite=Lax/);

    const matches = await v.call('GET', '/api/matches');
    assert.equal(matches.status, 200);
    assert.equal(matches.body.results[0].opportunity.id, 'opp-001');

    assert.equal((await v.call('POST', '/api/shortlist', { opportunityId: 'opp-001' })).status, 201);
    assert.equal((await v.call('PATCH', '/api/shortlist/opp-001', { status: 'applied' })).status, 200);
    const list = await v.call('GET', '/api/shortlist');
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].status, 'applied');
    assert.equal((await v.call('DELETE', '/api/shortlist/opp-001')).status, 204);
    assert.equal((await v.call('GET', '/api/shortlist')).body.items.length, 0);
  });

  test('visitors never see each other’s data', async () => {
    const a = visitor();
    const b = visitor();
    await a.call('PUT', '/api/profile', sampleProfile());
    await a.call('POST', '/api/shortlist', { opportunityId: 'opp-004' });
    assert.equal((await b.call('GET', '/api/profile')).body.profile, null);
    assert.equal((await b.call('GET', '/api/shortlist')).body.items.length, 0);
    assert.equal((await a.call('GET', '/api/shortlist')).body.items.length, 1);
  });

  test('a tampered or invalid cookie is ignored, not trusted', async () => {
    const forged = Buffer.from(
      JSON.stringify({
        profile: { skills: 'not-a-list', admin: true },
        shortlist: [{ opportunityId: '../../etc/passwd' }, { opportunityId: 'opp-001', status: 'hired' }],
      }),
    ).toString('base64url');
    const v = visitor();
    v.setCookie(`cmp_state=${forged}`);
    assert.equal((await v.call('GET', '/api/profile')).body.profile, null);
    const list = await v.call('GET', '/api/shortlist');
    assert.deepEqual(list.body.items.map((i) => [i.opportunityId, i.status]), [['opp-001', 'saved']]);

    v.setCookie('cmp_state=%%%not-base64%%%');
    assert.equal((await v.call('GET', '/api/profile')).status, 200);
  });

  test('a profile too large for a cookie is rejected with a clear message', async () => {
    const v = visitor();
    const big = { ...sampleProfile(), skills: Array.from({ length: 50 }, (_, i) => `skill number ${i} ${'x'.repeat(40)}`) };
    const r = await v.call('PUT', '/api/profile', big);
    assert.equal(r.status, 413);
    assert.equal(r.body.error, 'profile_too_large');
  });
});
