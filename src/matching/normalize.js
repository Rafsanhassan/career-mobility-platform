import { SKILL_SYNONYMS, RELATED_SKILLS, REGIONS } from './taxonomy.js';

/**
 * Normalise free text for comparison: lower case, punctuation stripped, whitespace
 * collapsed, and British/American spelling of "programme" unified.
 */
export function norm(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // strip accents: "Español" -> "espanol"
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+# ]+/gu, ' ') // keep letters in every script, not only a-z
    .replace(/\bprogrammes?\b/g, (m) => (m.endsWith('s') ? 'programs' : 'program'))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Map a skill to its canonical form using the synonym table. */
export function canonicalSkill(skill) {
  const n = norm(skill);
  return SKILL_SYNONYMS[n] ?? n;
}

const relatedIndex = new Map();
for (const [a, b] of RELATED_SKILLS) {
  if (!relatedIndex.has(a)) relatedIndex.set(a, new Set());
  if (!relatedIndex.has(b)) relatedIndex.set(b, new Set());
  relatedIndex.get(a).add(b);
  relatedIndex.get(b).add(a);
}

/** Canonical skills related to the given canonical skill (half-credit matches). */
export function relatedSkills(canonical) {
  return relatedIndex.get(canonical) ?? new Set();
}

// Generic words that would otherwise create misleading partial matches
// (e.g. "project support" vs "customer support").
const STOP_WORDS = new Set(['and', 'of', 'the', 'for', 'in', 'to', 'a', 'an', 'with', 'support', 'services', 'associate']);

/** Significant words of a phrase, used for loose phrase overlap (interests, experience areas). */
export function tokens(value) {
  return norm(value)
    .split(' ')
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Compare two short phrases. Returns 1 for an exact (normalised) match, 0.5 when they
 * share a significant word, otherwise 0.
 */
export function phraseSimilarity(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const tb = new Set(tokens(nb));
  return tokens(na).some((t) => tb.has(t)) ? 0.5 : 0;
}

/** Region key for a country, or null when unknown. */
export function regionOf(country) {
  const c = norm(country);
  for (const [region, countries] of Object.entries(REGIONS)) {
    if (countries.includes(c)) return region;
  }
  return null;
}

/** Title-case helper for display of normalised values. */
export function titleCase(value) {
  return String(value ?? '').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Human-readable list: "a, b and c" (or "a, b or c" for alternatives). */
export function listText(items, conjunction = 'and') {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} ${conjunction} ${list[list.length - 1]}`;
}
