import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { profileSchema, shortlistAddSchema, shortlistStatusSchema, formatIssues } from './validation/schemas.js';
import { loadOpportunities, createOpportunityRepository } from './data/opportunityRepository.js';
import { createStore } from './data/store.js';
import { matchOpportunity, rankOpportunities } from './matching/matcher.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Error carrying an HTTP status and a stable machine-readable code. */
class HttpError extends Error {
  constructor(status, code, message, issues) {
    super(message);
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

function parseOr400(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Some fields need attention.', formatIssues(parsed.error));
  }
  return parsed.data;
}

/**
 * Build the Express app. Paths are injectable so tests can run against a temporary
 * store without touching the developer's data.
 */
export function createApp({
  opportunitiesPath = join(ROOT, 'data', 'opportunities.json'),
  storePath = join(ROOT, 'data', 'store.json'),
  sampleProfilePath = join(ROOT, 'data', 'sample-profile.json'),
} = {}) {
  const opportunities = createOpportunityRepository(loadOpportunities(opportunitiesPath));
  const store = createStore(storePath);
  const sampleProfile = profileSchema.parse(JSON.parse(readFileSync(sampleProfilePath, 'utf8')));

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:",
    });
    next();
  });
  app.use(express.json({ limit: '50kb' }));

  const api = express.Router();
  // Profile data is personal: never let intermediaries cache API responses.
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const requireOpportunity = (id) => {
    const opp = opportunities.get(id);
    if (!opp) throw new HttpError(404, 'not_found', `Opportunity "${id}" was not found.`);
    return opp;
  };
  const requireProfile = () => {
    const profile = store.getProfile();
    if (!profile) throw new HttpError(409, 'profile_required', 'Create a profile first to see matches.');
    return profile;
  };
  const shortlistedIds = () => new Set(store.getShortlist().map((s) => s.opportunityId));

  api.get('/health', (req, res) => res.json({ status: 'ok', opportunities: opportunities.list().length }));

  // --- opportunities
  api.get('/opportunities', (req, res) => {
    const saved = shortlistedIds();
    res.json({ items: opportunities.list().map((o) => ({ ...o, shortlisted: saved.has(o.id) })) });
  });
  api.get('/opportunities/:id', (req, res) => {
    const opp = requireOpportunity(req.params.id);
    res.json({ ...opp, shortlisted: shortlistedIds().has(opp.id) });
  });

  // --- profile
  api.get('/profile', (req, res) => res.json({ profile: store.getProfile() }));
  api.put('/profile', (req, res) => {
    const profile = parseOr400(profileSchema, req.body);
    res.json({ profile: store.saveProfile(profile) });
  });
  api.delete('/profile', (req, res) => {
    store.deleteProfile();
    res.status(204).end();
  });
  api.get('/profile/sample', (req, res) => res.json({ profile: sampleProfile }));

  // --- matching
  api.get('/matches', (req, res) => {
    const profile = requireProfile();
    const saved = shortlistedIds();
    const results = rankOpportunities(profile, opportunities.list()).map((r) => ({
      ...r,
      shortlisted: saved.has(r.opportunity.id),
    }));
    res.json({ generatedAt: new Date().toISOString(), profileUpdatedAt: profile.updatedAt, results });
  });
  api.get('/matches/:id', (req, res) => {
    const opp = requireOpportunity(req.params.id);
    const profile = requireProfile();
    res.json({ opportunity: opp, match: matchOpportunity(profile, opp), shortlisted: shortlistedIds().has(opp.id) });
  });
  // Stateless matching: score a profile supplied in the request without storing it.
  api.post('/match', (req, res) => {
    const profile = parseOr400(profileSchema, req.body);
    res.json({ results: rankOpportunities(profile, opportunities.list()) });
  });

  // --- shortlist
  api.get('/shortlist', (req, res) => {
    const profile = store.getProfile();
    const items = store
      .getShortlist()
      .map((entry) => {
        const opportunity = opportunities.get(entry.opportunityId);
        if (!opportunity) return null; // catalogue changed since it was saved
        return { ...entry, opportunity, match: profile ? matchOpportunity(profile, opportunity) : null };
      })
      .filter(Boolean);
    res.json({ items });
  });
  api.post('/shortlist', (req, res) => {
    const { opportunityId } = parseOr400(shortlistAddSchema, req.body);
    requireOpportunity(opportunityId);
    const { entry, created } = store.addToShortlist(opportunityId);
    res.status(created ? 201 : 200).json({ entry });
  });
  api.patch('/shortlist/:id', (req, res) => {
    const { status } = parseOr400(shortlistStatusSchema, req.body);
    const entry = store.setShortlistStatus(req.params.id, status);
    if (!entry) throw new HttpError(404, 'not_found', 'That opportunity is not on your shortlist.');
    res.json({ entry });
  });
  api.delete('/shortlist/:id', (req, res) => {
    if (!store.removeFromShortlist(req.params.id)) {
      throw new HttpError(404, 'not_found', 'That opportunity is not on your shortlist.');
    }
    res.status(204).end();
  });

  api.use((req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown API route.' }));

  app.use('/api', api);
  app.use(express.static(join(ROOT, 'public'), { extensions: ['html'] }));

  // Central error handler: predictable JSON errors, no stack traces leaked to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, issues: err.issues });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large', message: 'Request body is too large.' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  });

  return app;
}
