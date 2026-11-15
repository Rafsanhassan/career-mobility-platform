import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const loadJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
export const sampleProfile = () => loadJson('data/sample-profile.json');
export const opportunities = () => loadJson('data/opportunities.json');
export const opportunity = (id) => opportunities().find((o) => o.id === id);

export const tempDir = () => mkdtempSync(join(tmpdir(), 'cmp-test-'));

/** A minimal, valid opportunity to build focused test cases from. */
export function baseOpportunity(overrides = {}) {
  return {
    id: 'opp-test',
    title: 'Test Role',
    organisation: 'Test Org',
    type: 'job',
    location: { city: 'Berlin', country: 'Germany', region: 'europe', workMode: 'onsite' },
    description: 'Test',
    requiredSkills: ['reporting'],
    preferredSkills: [],
    experience: null,
    education: null,
    languages: [],
    categories: [],
    eligibility: { workAuthorisationRequired: false },
    postedOn: '2026-11-01',
    ...overrides,
  };
}
