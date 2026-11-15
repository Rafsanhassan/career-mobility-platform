import { readFileSync } from 'node:fs';
import { opportunitySchema } from '../validation/schemas.js';

/**
 * Loads and validates the opportunity catalogue from a JSON file. The catalogue is
 * read-only at runtime, so it is held in memory after a validated load.
 */
export function loadOpportunities(filePath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read opportunity data from ${filePath}: ${err.message}`);
  }
  if (!Array.isArray(raw)) throw new Error('Opportunity data must be a JSON array');

  const ids = new Set();
  return raw.map((item, index) => {
    const parsed = opportunitySchema.safeParse(item);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid opportunity at index ${index} (${item?.id ?? 'no id'}): ${detail}`);
    }
    if (ids.has(parsed.data.id)) throw new Error(`Duplicate opportunity id: ${parsed.data.id}`);
    ids.add(parsed.data.id);
    return Object.freeze(parsed.data);
  });
}

export function createOpportunityRepository(opportunities) {
  const byId = new Map(opportunities.map((o) => [o.id, o]));
  return {
    list: () => opportunities,
    get: (id) => byId.get(id) ?? null,
  };
}
