import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchOpportunity, rankOpportunities } from '../src/matching/matcher.js';
import { sampleProfile, opportunities, opportunity, baseOpportunity } from './helpers.js';

const flagCodes = (m) => m.flags.map((f) => f.code);
const criterion = (m, key) => m.breakdown.find((c) => c.key === key);

describe('Required test cases (sample profile from the brief)', () => {
  test('STRONG MATCH: Programme Assistant at an international NGO', () => {
    const m = matchOpportunity(sampleProfile(), opportunity('opp-001'));
    assert.equal(m.label, 'strong');
    assert.ok(m.score >= 90, `expected >= 90, got ${m.score}`);
    assert.ok(m.strengths.some((s) => s.includes('3 of 3 required skills')));
    assert.equal(criterion(m, 'language').score, 1);
    // Work authorisation is unknown: flagged for verification, never treated as satisfied.
    assert.equal(m.eligibility, 'verify');
    const auth = m.flags.find((f) => f.code === 'WORK_AUTHORISATION_UNKNOWN');
    assert.ok(auth, 'expected a work authorisation verification flag');
    assert.match(auth.message, /not a legal determination/);
  });

  test('PARTIAL MATCH: Research Assistant (remote, Europe)', () => {
    const m = matchOpportunity(sampleProfile(), opportunity('opp-008'));
    assert.equal(m.label, 'partial');
    assert.ok(m.score >= 50 && m.score < 75, `expected 50-74, got ${m.score}`);
    // Has research, missing data analysis (related via Excel -> half credit), so skills are partial.
    assert.ok(criterion(m, 'skills').score > 0 && criterion(m, 'skills').score < 1);
    assert.ok(m.strengths.some((s) => s.includes('Related skill')));
    // Residence is unknown in the sample profile: verification flag, not a pass.
    assert.ok(flagCodes(m).includes('RESIDENCE_UNKNOWN'));
  });

  test('CRITICAL GAP (language): German-speaking Client Associate', () => {
    const m = matchOpportunity(sampleProfile(), opportunity('opp-003'));
    assert.equal(m.label, 'critical-gap');
    assert.equal(m.eligibility, 'blocked');
    assert.ok(flagCodes(m).includes('LANGUAGE_REQUIREMENT_NOT_MET'));
    assert.ok(m.gaps.some((g) => g.includes('does not list German')));
    assert.match(m.summary, /Critical gap/);
  });

  test('CRITICAL GAP (eligibility): Business Analyst Intern requires current enrolment', () => {
    const m = matchOpportunity(sampleProfile(), opportunity('opp-002'));
    assert.equal(m.eligibility, 'blocked');
    assert.ok(flagCodes(m).includes('ENROLMENT_REQUIRED'));
    // Also missing local work-authorisation information.
    assert.ok(flagCodes(m).includes('WORK_AUTHORISATION_UNKNOWN'));
  });

  test('POOR MATCH: Backend Software Engineer ranks low', () => {
    const m = matchOpportunity(sampleProfile(), opportunity('opp-009'));
    assert.equal(m.label, 'weak');
    assert.equal(criterion(m, 'skills').score, 0);
  });
});

describe('Ranking', () => {
  test('roles with a critical gap are ranked after all other roles', () => {
    const ranked = rankOpportunities(sampleProfile(), opportunities());
    const firstBlocked = ranked.findIndex((r) => r.match.eligibility === 'blocked');
    assert.ok(firstBlocked > 0);
    assert.ok(ranked.slice(firstBlocked).every((r) => r.match.eligibility === 'blocked'));
  });

  test('non-blocked roles are sorted by score, and strong matches lead', () => {
    const ranked = rankOpportunities(sampleProfile(), opportunities()).filter((r) => r.match.eligibility !== 'blocked');
    for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].match.score >= ranked[i].match.score);
    assert.equal(ranked[0].opportunity.id, 'opp-001');
  });

  test('is deterministic', () => {
    const a = rankOpportunities(sampleProfile(), opportunities()).map((r) => r.opportunity.id);
    const b = rankOpportunities(sampleProfile(), [...opportunities()].reverse()).map((r) => r.opportunity.id);
    assert.deepEqual(a, b);
  });

  test('breakdown points add up to the score', () => {
    for (const { match } of rankOpportunities(sampleProfile(), opportunities())) {
      const sum = match.breakdown.reduce((s, c) => s + c.points, 0);
      assert.ok(Math.abs(sum - match.score) <= 1, `sum ${sum} vs score ${match.score}`);
    }
  });
});

describe('Missing data handling', () => {
  test('a requirement the role does not state is excluded, not counted as met or failed', () => {
    const m = matchOpportunity(sampleProfile(), baseOpportunity({ requiredSkills: ['reporting'] }));
    assert.equal(criterion(m, 'education').applicable, false);
    assert.equal(criterion(m, 'experience').applicable, false);
    assert.equal(m.score, 100); // only skills (met) and location (Germany preferred) apply
  });

  test('missing profile data scores zero for that criterion and is reported as a gap', () => {
    const profile = { ...sampleProfile(), experience: { totalYears: null, areas: [] } };
    const m = matchOpportunity(profile, opportunity('opp-001'));
    assert.equal(criterion(m, 'experience').score, 0);
    assert.ok(m.gaps.some((g) => g.includes('Years of experience not provided')));
  });

  test('no location preference means location is not scored', () => {
    const profile = { ...sampleProfile(), preferredLocations: [], openToRemote: false };
    const m = matchOpportunity(profile, opportunity('opp-009'));
    assert.equal(criterion(m, 'location').applicable, false);
  });

  test('unknown enrolment status is flagged for verification, not assumed', () => {
    const profile = { ...sampleProfile(), education: { ...sampleProfile().education, currentlyEnrolled: 'unknown' } };
    const m = matchOpportunity(profile, opportunity('opp-002'));
    assert.ok(flagCodes(m).includes('ENROLMENT_UNKNOWN'));
    assert.equal(m.eligibility, 'verify');
  });
});

describe('Work authorisation', () => {
  const role = baseOpportunity({ eligibility: { workAuthorisationRequired: true, visaSponsorship: 'not_available' } });

  test('self-reported authorisation in the role country is noted as unverified', () => {
    const profile = { ...sampleProfile(), workAuthorisation: { status: 'specified', countries: ['Germany'] } };
    const m = matchOpportunity(profile, role);
    assert.equal(m.eligibility, 'clear');
    assert.ok(m.flags.some((f) => f.code === 'WORK_AUTHORISATION_SELF_REPORTED' && /not been verified/.test(f.message)));
  });

  test('authorisation for other countries only, with no sponsorship, is a critical gap', () => {
    const profile = { ...sampleProfile(), workAuthorisation: { status: 'specified', countries: ['Bangladesh'] } };
    const m = matchOpportunity(profile, role);
    assert.equal(m.eligibility, 'blocked');
    assert.match(m.flags.find((f) => f.code === 'WORK_AUTHORISATION_NOT_LISTED').message, /not a legal determination/);
  });

  test('sponsorship available turns the gap into a verification flag', () => {
    const profile = { ...sampleProfile(), workAuthorisation: { status: 'specified', countries: ['Bangladesh'] } };
    const m = matchOpportunity(profile, { ...role, eligibility: { workAuthorisationRequired: true, visaSponsorship: 'available' } });
    assert.equal(m.eligibility, 'verify');
    assert.ok(flagCodes(m).includes('SPONSORSHIP_NEEDED'));
  });
});

describe('Criterion details', () => {
  test('skill synonyms are recognised (MS Excel = Excel, report writing = reporting)', () => {
    const profile = { ...sampleProfile(), skills: ['MS Excel', 'report writing'] };
    const m = matchOpportunity(profile, baseOpportunity({ requiredSkills: ['Excel', 'reporting'] }));
    assert.equal(criterion(m, 'skills').score, 1);
  });

  test('a related skill earns half credit and is named in the explanation', () => {
    const profile = { ...sampleProfile(), skills: ['project coordination'] };
    const m = matchOpportunity(profile, baseOpportunity({ requiredSkills: ['project management'] }));
    assert.equal(criterion(m, 'skills').score, 0.5);
    assert.ok(m.strengths.some((s) => s.includes('"project coordination"') && s.includes('"project management"')));
  });

  test('language one level below a hard requirement is a verification flag, two levels below is a blocker', () => {
    const role = baseOpportunity({ languages: [{ language: 'German', level: 'professional', required: true }] });
    const conv = matchOpportunity({ ...sampleProfile(), languages: [{ language: 'German', level: 'conversational' }] }, role);
    const basic = matchOpportunity({ ...sampleProfile(), languages: [{ language: 'German', level: 'basic' }] }, role);
    assert.equal(conv.eligibility, 'verify');
    assert.equal(basic.eligibility, 'blocked');
  });

  test('an optional language that is not met lowers the score but does not block', () => {
    const role = baseOpportunity({ languages: [{ language: 'French', level: 'professional', required: false }] });
    const m = matchOpportunity(sampleProfile(), role);
    assert.equal(m.eligibility, 'clear');
    assert.equal(criterion(m, 'language').score, 0);
  });

  test('education below the minimum level is a gap', () => {
    const m = matchOpportunity(sampleProfile(), opportunity('opp-007'));
    assert.ok(m.gaps.some((g) => g.includes("Master's degree")));
  });

  test('being well above the experience range is noted, not hidden', () => {
    const profile = { ...sampleProfile(), experience: { totalYears: 9, areas: [] } };
    const m = matchOpportunity(profile, opportunity('opp-001'));
    assert.ok(flagCodes(m).includes('POSSIBLY_OVERQUALIFIED'));
  });
});

describe('Edge cases from code review', () => {
  test('non-Latin language names are compared correctly, not collapsed to an empty key', () => {
    const role = baseOpportunity({ languages: [{ language: '日本語', level: 'professional', required: true }] });
    const m = matchOpportunity({ ...sampleProfile(), languages: [{ language: '中文', level: 'native' }] }, role);
    assert.equal(m.eligibility, 'blocked');
    const ok = matchOpportunity({ ...sampleProfile(), languages: [{ language: '日本語', level: 'native' }] }, role);
    assert.equal(criterion(ok, 'language').score, 1);
  });

  test('accents are ignored when comparing languages', () => {
    const role = baseOpportunity({ languages: [{ language: 'Español', level: 'professional', required: true }] });
    const m = matchOpportunity({ ...sampleProfile(), languages: [{ language: 'Espanol', level: 'professional' }] }, role);
    assert.equal(criterion(m, 'language').score, 1);
  });

  test('work authorisation required but no country stated is flagged, not silently passed', () => {
    const role = baseOpportunity({
      location: { city: null, country: null, region: 'europe', workMode: 'remote' },
      eligibility: { workAuthorisationRequired: true },
    });
    const m = matchOpportunity(sampleProfile(), role);
    assert.ok(flagCodes(m).includes('WORK_AUTHORISATION_LOCATION_UNCLEAR'));
    assert.equal(m.eligibility, 'verify');
  });

  test('unknown sponsorship policy is a verification flag, not a blocker', () => {
    const profile = { ...sampleProfile(), workAuthorisation: { status: 'specified', countries: ['Bangladesh'] } };
    const m = matchOpportunity(profile, baseOpportunity({ eligibility: { workAuthorisationRequired: true, visaSponsorship: 'unknown' } }));
    assert.equal(m.eligibility, 'verify');
  });

  test('field of study must match whole words ("IS" does not match "business")', () => {
    const profile = { ...sampleProfile(), education: { level: 'bachelor', field: 'IS', currentlyEnrolled: 'no' } };
    const m = matchOpportunity(profile, baseOpportunity({ education: { minLevel: 'bachelor', fields: ['business'] } }));
    assert.ok(m.gaps.some((g) => g.includes('prefers a background in business')));
  });

  test('a role that can only be scored on a small part of the model is never labelled strong', () => {
    const role = baseOpportunity({ requiredSkills: [], categories: ['programme support'], location: { city: null, country: null, region: null, workMode: 'remote' } });
    const m = matchOpportunity({ ...sampleProfile(), preferredLocations: [] }, role);
    assert.equal(m.score, 100);
    assert.notEqual(m.label, 'strong');
    assert.ok(flagCodes(m).includes('LOW_COVERAGE'));
  });

  test('open to remote with no preferred locations does not penalise on-site roles', () => {
    const m = matchOpportunity({ ...sampleProfile(), preferredLocations: [], openToRemote: true }, opportunity('opp-001'));
    assert.equal(criterion(m, 'location').applicable, false);
  });

  test('a residence country the system does not recognise is flagged for verification, not blocked', () => {
    const m = matchOpportunity({ ...sampleProfile(), currentCountry: 'Narnia' }, opportunity('opp-008'));
    assert.ok(flagCodes(m).includes('RESIDENCE_UNCLEAR'));
    assert.notEqual(m.eligibility, 'blocked');
  });
});
