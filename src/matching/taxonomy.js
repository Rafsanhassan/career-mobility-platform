/**
 * Reference vocabulary used by the matching engine.
 *
 * Everything here is plain data so the matching rules stay transparent and easy to
 * extend: adding a synonym or a related-skill pair changes behaviour without touching
 * the scoring code.
 */

/** Ordinal education levels. Higher number = higher attainment. */
export const EDUCATION_LEVELS = Object.freeze({
  none: 0,
  secondary: 1,
  diploma: 2,
  bachelor: 3,
  master: 4,
  doctorate: 5,
});

export const EDUCATION_LABELS = Object.freeze({
  none: 'No formal qualification',
  secondary: 'Secondary school',
  diploma: 'Diploma / associate degree',
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate: 'Doctorate',
});

/** Ordinal language proficiency levels. */
export const LANGUAGE_LEVELS = Object.freeze({
  basic: 1,
  conversational: 2,
  professional: 3,
  native: 4,
});

/**
 * Criterion weights (points out of 100). When a criterion does not apply to an
 * opportunity, its weight is removed and the remaining weights are rescaled, so a
 * role is never rewarded or penalised for a requirement it does not state.
 */
export const WEIGHTS = Object.freeze({
  skills: 35,
  experience: 20,
  education: 15,
  location: 10,
  language: 10,
  interests: 10,
});

/** Score thresholds for the fit label (applied only when there is no critical gap). */
export const LABEL_THRESHOLDS = Object.freeze({ strong: 75, partial: 50 });

/**
 * Skill synonyms -> canonical skill name. Keys and values are already normalised
 * (lower case, single spaces, "programme" spelled "program").
 */
export const SKILL_SYNONYMS = Object.freeze({
  'ms excel': 'excel',
  'microsoft excel': 'excel',
  spreadsheets: 'excel',
  'advanced excel': 'excel',
  'report writing': 'reporting',
  'written reporting': 'reporting',
  'donor reporting': 'reporting',
  'stakeholder management': 'stakeholder communication',
  'stakeholder engagement': 'stakeholder communication',
  'communication skills': 'communication',
  'written communication': 'communication',
  'verbal communication': 'communication',
  coordination: 'project coordination',
  'project support': 'project coordination',
  'data analytics': 'data analysis',
  analytics: 'data analysis',
  presentations: 'presentation',
  'presentation skills': 'presentation',
  'customer service': 'customer support',
  'client support': 'customer support',
  'desk research': 'research',
  'market research': 'research',
  'policy research': 'research',
  'process documentation': 'documentation',
  'crm software': 'crm',
  salesforce: 'crm',
  'ms project': 'project scheduling',
  scheduling: 'project scheduling',
});

/**
 * Pairs of distinct skills that are related enough to earn half credit. The match
 * explanation always names both skills, so partial credit is never hidden.
 */
export const RELATED_SKILLS = Object.freeze([
  ['project coordination', 'project management'],
  ['project coordination', 'project scheduling'],
  ['project coordination', 'program support'],
  ['stakeholder communication', 'communication'],
  ['stakeholder communication', 'client relationship management'],
  ['reporting', 'documentation'],
  ['reporting', 'presentation'],
  ['excel', 'data analysis'],
  ['research', 'data analysis'],
  ['communication', 'customer support'],
]);

/** Education field families: an opportunity field key -> user fields that satisfy it. */
export const FIELD_FAMILIES = Object.freeze({
  business: ['business', 'management', 'commerce', 'finance', 'marketing', 'economics', 'accounting'],
  'social science': [
    'social science',
    'sociology',
    'political science',
    'international relations',
    'development studies',
    'economics',
    'psychology',
    'anthropology',
    'public policy',
  ],
  economics: ['economics', 'econometrics'],
  'computer science': ['computer science', 'software engineering', 'information technology', 'computing'],
  statistics: ['statistics', 'mathematics', 'data science', 'econometrics'],
  communications: ['communications', 'journalism', 'media', 'marketing'],
  engineering: ['engineering'],
});

/** Country -> region lookup, used to recognise "same region" and region-wide preferences. */
export const REGIONS = Object.freeze({
  europe: ['germany', 'france', 'netherlands', 'switzerland', 'austria', 'belgium', 'ireland', 'spain', 'italy', 'sweden', 'denmark', 'united kingdom', 'poland'],
  'north america': ['canada', 'united states', 'usa', 'mexico'],
  asia: ['singapore', 'bangladesh', 'india', 'japan', 'malaysia', 'indonesia', 'vietnam', 'thailand', 'hong kong', 'south korea'],
  'middle east': ['united arab emirates', 'qatar', 'saudi arabia'],
  oceania: ['australia', 'new zealand'],
  africa: ['kenya', 'south africa', 'nigeria', 'ghana', 'rwanda'],
});
