/**
 * Individual matching criteria.
 *
 * Every evaluator takes (profile, opportunity) and returns a CriterionResult:
 *   {
 *     applicable: boolean,  // false = excluded from the score (requirement not stated,
 *                           //         or the user has no preference to compare against)
 *     score: number|null,   // 0..1 when applicable
 *     strengths: string[],  // evidence that supports the match
 *     gaps: string[],       // evidence against the match, or missing information
 *     flags: Flag[],        // { severity: 'blocker'|'verify'|'info', code, message }
 *     note?: string         // why a criterion was not scored
 *   }
 *
 * Rules of thumb used throughout:
 *  - If the OPPORTUNITY does not state a requirement, the criterion is not applicable.
 *  - If the opportunity states a requirement but the PROFILE is missing the data, the
 *    criterion scores 0 and the gap says the information is missing (never assumed met).
 *  - Location and interests are preferences: if the user gave none, they are not scored.
 */
import {
  EDUCATION_LEVELS,
  EDUCATION_LABELS,
  LANGUAGE_LEVELS,
  FIELD_FAMILIES,
  REGIONS,
} from './taxonomy.js';
import {
  norm,
  canonicalSkill,
  relatedSkills,
  phraseSimilarity,
  regionOf,
  titleCase,
  listText,
} from './normalize.js';

const notApplicable = (note) => ({ applicable: false, score: null, strengths: [], gaps: [], flags: [], note });
const result = (score, strengths = [], gaps = [], flags = []) => ({
  applicable: true,
  score: Math.max(0, Math.min(1, score)),
  strengths,
  gaps,
  flags,
});

/* ------------------------------------------------------------------ skills */

export function evaluateSkills(profile, opp) {
  const required = opp.requiredSkills ?? [];
  const preferred = opp.preferredSkills ?? [];
  if (!required.length && !preferred.length) return notApplicable('The role does not list specific skills.');

  const userSkills = new Map((profile.skills ?? []).map((s) => [canonicalSkill(s), s]));
  if (!userSkills.size) {
    return result(0, [], ['Your profile lists no skills, so skill fit could not be assessed.']);
  }

  const assess = (skill) => {
    const c = canonicalSkill(skill);
    if (userSkills.has(c)) return { skill, credit: 1, via: userSkills.get(c) };
    for (const rel of relatedSkills(c)) {
      if (userSkills.has(rel)) return { skill, credit: 0.5, via: userSkills.get(rel) };
    }
    return { skill, credit: 0 };
  };

  const req = required.map(assess);
  const pref = preferred.map(assess);
  const share = (list) => list.reduce((sum, r) => sum + r.credit, 0) / list.length;

  let score;
  if (req.length && pref.length) score = 0.8 * share(req) + 0.2 * share(pref);
  else score = share(req.length ? req : pref);

  const strengths = [];
  const gaps = [];
  const fullReq = req.filter((r) => r.credit === 1);
  if (req.length) {
    if (fullReq.length) {
      strengths.push(`Has ${fullReq.length} of ${req.length} required skills: ${listText(fullReq.map((r) => r.skill))}.`);
    }
  }
  for (const r of [...req, ...pref].filter((x) => x.credit === 0.5)) {
    strengths.push(`Related skill: you list "${r.via}", the role asks for "${r.skill}" (half credit).`);
  }
  const fullPref = pref.filter((r) => r.credit === 1);
  if (fullPref.length) strengths.push(`Also has preferred skills: ${listText(fullPref.map((r) => r.skill))}.`);

  const missingReq = req.filter((r) => r.credit === 0).map((r) => r.skill);
  const missingPref = pref.filter((r) => r.credit === 0).map((r) => r.skill);
  if (missingReq.length) gaps.push(`Missing required skills: ${listText(missingReq)}.`);
  if (missingPref.length) gaps.push(`Missing preferred skills: ${listText(missingPref)}.`);

  // Per-skill status, so the interface can show exactly which skills matched.
  const status = ({ skill, credit, via }) => ({
    skill,
    status: credit === 1 ? 'met' : credit === 0.5 ? 'related' : 'missing',
    via: credit === 0.5 ? via : null,
  });
  return { ...result(score, strengths, gaps), details: { required: req.map(status), preferred: pref.map(status) } };
}

/* -------------------------------------------------------------- experience */

const yearsText = (n) => `${n} year${n === 1 ? '' : 's'}`;

function rangeText(min, max) {
  if (min != null && max != null) return min === max ? yearsText(min) : `${min}–${max} years`;
  if (min != null) return `at least ${yearsText(min)}`;
  return `up to ${yearsText(max)}`;
}

export function evaluateExperience(profile, opp) {
  const { minYears = null, maxYears = null, areas = [] } = opp.experience ?? {};
  if (minYears == null && maxYears == null && !areas.length) {
    return notApplicable('The role does not state an experience requirement.');
  }

  const strengths = [];
  const gaps = [];
  const flags = [];
  const years = profile.experience?.totalYears;

  let yearsFit = null;
  if (minYears != null || maxYears != null) {
    const wanted = rangeText(minYears, maxYears);
    if (years == null) {
      yearsFit = 0;
      gaps.push(`Years of experience not provided; the role asks for ${wanted}.`);
    } else if (minYears != null && years < minYears) {
      const deficit = minYears - years;
      yearsFit = deficit <= 1 ? 0.5 : 0;
      gaps.push(`You have ${yearsText(years)} of experience; the role asks for ${wanted}.`);
    } else if (maxYears != null && years > maxYears) {
      const over = years - maxYears;
      yearsFit = over <= 2 ? 0.8 : 0.5;
      strengths.push(`Meets the experience requirement (${wanted}).`);
      flags.push({
        severity: 'info',
        code: 'POSSIBLY_OVERQUALIFIED',
        message: `You have ${yearsText(years)} of experience; this role targets ${wanted}, so it may be more junior than you need.`,
      });
    } else {
      yearsFit = 1;
      strengths.push(`${yearsText(years)} of experience meets the requirement (${wanted}).`);
    }
  }

  let areaFit = null;
  if (areas.length) {
    const userAreas = profile.experience?.areas ?? [];
    let best = { score: 0 };
    for (const area of areas) {
      for (const ua of userAreas) {
        const s = phraseSimilarity(ua, area);
        if (s > best.score) best = { score: s, area, ua };
      }
    }
    areaFit = best.score;
    if (best.score === 1) strengths.push(`Directly relevant experience in ${best.area}.`);
    else if (best.score === 0.5) strengths.push(`Partly relevant experience: "${best.ua}" relates to ${best.area}.`);
    else if (!userAreas.length) gaps.push(`Experience areas not provided; the role looks for experience in ${listText(areas, 'or')}.`);
    else gaps.push(`No experience listed in ${listText(areas, 'or')}.`);
  }

  let score;
  if (yearsFit != null && areaFit != null) score = 0.7 * yearsFit + 0.3 * areaFit;
  else score = yearsFit ?? areaFit;
  return result(score, strengths, gaps, flags);
}

/* --------------------------------------------------------------- education */

/** True when `phrase` appears in `text` as whole words ("business" in "business administration"). */
const containsPhrase = (text, phrase) => phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);

function fieldMatches(userField, oppFields) {
  const uf = norm(userField);
  if (!uf) return null;
  return oppFields.find((f) => {
    const family = FIELD_FAMILIES[norm(f)] ?? [norm(f)];
    return family.some((member) => containsPhrase(uf, member) || (uf.length >= 4 && containsPhrase(member, uf)));
  });
}

export function evaluateEducation(profile, opp) {
  const req = opp.education;
  const fields = req?.fields ?? [];
  if (!req || (req.minLevel == null && !fields.length)) {
    return notApplicable('The role does not state an education requirement.');
  }

  const strengths = [];
  const gaps = [];
  const userLevel = profile.education?.level;
  const userField = profile.education?.field;

  let levelFit = null;
  if (req.minLevel != null) {
    const needed = EDUCATION_LABELS[req.minLevel];
    if (!userLevel) {
      levelFit = 0;
      gaps.push(`Education level not provided; the role asks for at least a ${needed}.`);
    } else {
      const diff = EDUCATION_LEVELS[userLevel] - EDUCATION_LEVELS[req.minLevel];
      if (diff >= 0) {
        levelFit = 1;
        strengths.push(`${EDUCATION_LABELS[userLevel]} meets the minimum (${needed}).`);
      } else {
        levelFit = diff === -1 ? 0.4 : 0;
        gaps.push(`The role asks for at least a ${needed}; your profile shows ${EDUCATION_LABELS[userLevel]}.`);
      }
    }
  }

  let fieldFit = null;
  if (fields.length) {
    const hit = fieldMatches(userField, fields);
    if (hit === null) {
      fieldFit = 0;
      gaps.push(`Field of study not provided; the role prefers ${listText(fields, 'or')}.`);
    } else if (hit) {
      fieldFit = 1;
      strengths.push(`Field of study (${userField}) is relevant to the requested ${hit} background.`);
    } else {
      fieldFit = 0;
      gaps.push(`The role prefers a background in ${listText(fields, 'or')}; your field is ${userField}.`);
    }
  }

  let score;
  if (levelFit != null && fieldFit != null) score = 0.6 * levelFit + 0.4 * fieldFit;
  else score = levelFit ?? fieldFit;
  return result(score, strengths, gaps);
}

/* ---------------------------------------------------------------- location */

export function evaluateLocation(profile, opp) {
  const loc = opp.location ?? {};
  const prefs = (profile.preferredLocations ?? []).map(norm).filter(Boolean);
  const place = loc.workMode === 'remote' ? `remote (${titleCase(loc.region ?? 'any region')})` : [loc.city, loc.country].filter(Boolean).join(', ');

  if (!prefs.length && (!profile.openToRemote || loc.workMode !== 'remote')) {
    return notApplicable('No preferred locations set, so location was not scored.');
  }

  const country = norm(loc.country);
  const region = norm(loc.region) || regionOf(country);
  const prefRegions = new Set(prefs.map((p) => (Object.hasOwn(REGIONS, p) ? p : regionOf(p))).filter(Boolean));

  if (loc.workMode === 'remote') {
    if (profile.openToRemote) return result(1, [`Remote role and you are open to remote work.`]);
    if (region && prefRegions.has(region)) {
      return result(0.9, [`Remote role open to applicants based in ${titleCase(region)}, which includes your preferred locations.`]);
    }
    return result(0.6, [], [`Remote role (${titleCase(region ?? 'any region')}); you have not marked yourself as open to remote work.`]);
  }

  if (country && prefs.includes(country)) return result(1, [`Located in ${place}, one of your preferred locations.`]);
  if (region && prefs.includes(region)) return result(0.8, [`Located in ${place}, within your preferred region (${titleCase(region)}).`]);
  if (region && prefRegions.has(region)) {
    return result(0.3, [], [`Located in ${place}: not one of your preferred countries, but in the same region (${titleCase(region)}).`]);
  }
  return result(0, [], [`Located in ${place}, outside your preferred locations.`]);
}

/* ---------------------------------------------------------------- language */

export function evaluateLanguage(profile, opp) {
  const reqs = opp.languages ?? [];
  if (!reqs.length) return notApplicable('The role does not state a language requirement.');

  const userLangs = new Map(
    (profile.languages ?? []).map((l) => [norm(l.language), l.level]).filter(([key]) => key),
  );
  const strengths = [];
  const gaps = [];
  const flags = [];
  let total = 0;

  for (const r of reqs) {
    const hard = r.required !== false;
    const userLevel = norm(r.language) ? userLangs.get(norm(r.language)) : undefined;
    const diff = userLevel ? LANGUAGE_LEVELS[userLevel] - LANGUAGE_LEVELS[r.level] : -Infinity;
    const wanted = `${r.level} ${r.language}`;
    let credit;
    if (diff >= 0) {
      credit = 1;
      strengths.push(`Meets the ${wanted} requirement (you list ${userLevel}).`);
    } else if (diff === -1) {
      credit = 0.5;
      gaps.push(`The role asks for ${wanted}; you list ${userLevel}.`);
      if (hard) {
        flags.push({
          severity: 'verify',
          code: 'LANGUAGE_BELOW_LEVEL',
          message: `${r.language} at ${r.level} level is a stated requirement; your listed level (${userLevel}) is one step below. Check whether the employer would accept it.`,
        });
      }
    } else {
      credit = 0;
      gaps.push(`The role asks for ${wanted}; ${userLevel ? `you list ${userLevel}` : `your profile does not list ${r.language}`}.`);
      if (hard) {
        flags.push({
          severity: 'blocker',
          code: 'LANGUAGE_REQUIREMENT_NOT_MET',
          message: `${titleCase(r.level)} ${r.language} is a mandatory requirement for this role and is not met by your profile.`,
        });
      }
    }
    // Optional ("nice to have") languages count in the score like required ones; only
    // required languages can raise eligibility flags.
    total += credit;
  }
  return result(total / reqs.length, strengths, gaps, flags);
}

/* --------------------------------------------------------------- interests */

export function evaluateInterests(profile, opp) {
  const categories = opp.categories ?? [];
  if (!categories.length) return notApplicable('The role has no career-area tags.');
  const interests = profile.careerInterests ?? [];
  if (!interests.length) return notApplicable('No career interests set, so interest fit was not scored.');

  let best = { score: 0 };
  for (const c of categories) {
    for (const i of interests) {
      const s = phraseSimilarity(i, c);
      if (s > best.score) best = { score: s, c, i };
    }
  }
  if (best.score === 1) return result(1, [`Matches your career interest in ${best.i}.`]);
  if (best.score === 0.5) return result(0.5, [`Related to your interest in ${best.i} (role area: ${best.c}).`]);
  return result(0, [], [`Role area (${listText(categories)}) is outside your stated career interests.`]);
}

/* ------------------------------------------------------------- eligibility */

const DISCLAIMER = 'This is not a legal determination.';

/**
 * Hard constraints. These never add points; they raise flags that drive the
 * eligibility status of a match. Unknown information is flagged for verification,
 * never treated as satisfied.
 */
export function evaluateEligibility(profile, opp) {
  const e = opp.eligibility ?? {};
  const flags = [];
  const country = opp.location?.country;
  const auth = profile.workAuthorisation ?? { status: 'unknown', countries: [] };

  if (e.workAuthorisationRequired && !country) {
    flags.push({
      severity: 'verify',
      code: 'WORK_AUTHORISATION_LOCATION_UNCLEAR',
      message: `Requires work authorisation, but the listing does not say for which country. Check with the employer. ${DISCLAIMER}`,
    });
  }

  if (e.workAuthorisationRequired && country) {
    const sponsorshipNote =
      e.visaSponsorship === 'available'
        ? ' The employer states that visa sponsorship may be available.'
        : e.visaSponsorship === 'not_available'
          ? ' The employer states that it does not offer visa sponsorship.'
          : '';
    if (auth.status !== 'specified') {
      flags.push({
        severity: 'verify',
        code: 'WORK_AUTHORISATION_UNKNOWN',
        message: `Requires the right to work in ${country}. Your work authorisation is not specified, so it needs verification.${sponsorshipNote} ${DISCLAIMER}`,
      });
    } else if ((auth.countries ?? []).map(norm).filter(Boolean).includes(norm(country))) {
      flags.push({
        severity: 'info',
        code: 'WORK_AUTHORISATION_SELF_REPORTED',
        message: `You indicated you can work in ${country}. This is self-reported and has not been verified.`,
      });
    } else if (e.visaSponsorship !== 'not_available') {
      flags.push({
        severity: 'verify',
        code: 'SPONSORSHIP_NEEDED',
        message: `You did not list ${country} among the countries you can work in. ${
          e.visaSponsorship === 'available'
            ? 'The employer states sponsorship may be available'
            : 'The listing does not say whether visa sponsorship is offered'
        }; confirm before applying. ${DISCLAIMER}`,
      });
    } else {
      flags.push({
        severity: 'blocker',
        code: 'WORK_AUTHORISATION_NOT_LISTED',
        message: `Requires the right to work in ${country} without sponsorship, and you did not list ${country} among the countries you can work in. Based on what you entered this is likely a barrier. ${DISCLAIMER}`,
      });
    }
  }

  if (e.residenceRegion) {
    const home = profile.currentCountry;
    if (!home) {
      flags.push({
        severity: 'verify',
        code: 'RESIDENCE_UNKNOWN',
        message: `Applicants must be based in ${titleCase(e.residenceRegion)}. Your country of residence is not specified, so this needs verification.`,
      });
    } else if (!regionOf(home) && norm(home) !== norm(e.residenceRegion)) {
      flags.push({
        severity: 'verify',
        code: 'RESIDENCE_UNCLEAR',
        message: `Applicants must be based in ${titleCase(e.residenceRegion)}. We could not tell whether ${home} is in that region, so this needs verification.`,
      });
    } else if (regionOf(home) !== norm(e.residenceRegion) && norm(home) !== norm(e.residenceRegion)) {
      flags.push({
        severity: 'blocker',
        code: 'RESIDENCE_REQUIREMENT_NOT_MET',
        message: `Applicants must be based in ${titleCase(e.residenceRegion)}; your profile says you are based in ${home}.`,
      });
    }
  }

  if (e.enrolledStudentRequired) {
    const enrolled = profile.education?.currentlyEnrolled ?? 'unknown';
    if (enrolled === 'no') {
      flags.push({
        severity: 'blocker',
        code: 'ENROLMENT_REQUIRED',
        message: 'This role is only open to currently enrolled students, and your profile says you are not currently enrolled.',
      });
    } else if (enrolled === 'unknown') {
      flags.push({
        severity: 'verify',
        code: 'ENROLMENT_UNKNOWN',
        message: 'This role is only open to currently enrolled students. Your enrolment status is not specified.',
      });
    } else {
      flags.push({ severity: 'info', code: 'ENROLMENT_MET', message: 'Open to enrolled students, and you are currently enrolled.' });
    }
  }

  for (const other of e.otherRequirements ?? []) {
    flags.push({ severity: 'info', code: 'OTHER_REQUIREMENT', message: `Also requires: ${other} (not assessed automatically).` });
  }

  return flags;
}
