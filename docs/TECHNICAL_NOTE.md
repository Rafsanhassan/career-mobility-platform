# Technical note

## Scope

A job-search product, the Career Mobility Platform, built around one complete journey: profile → evaluated
opportunities → ranked, explained recommendations → detail → shortlist. Reliability and transparency were prioritised over breadth. The guiding rule
is that **the system never claims more than the data supports**: unstated requirements are not
scored, missing profile information is reported as missing, and eligibility questions are
flagged for verification with an explicit "not a legal determination" note.

## Architecture

```
Browser (vanilla JS modules, hash router)
   │ JSON over HTTP
Express API ── zod validation ── matching engine (pure functions)
   │                                  │
store.json (profile, shortlist)       opportunities.json (read-only)
```

- **Frontend:** static HTML, CSS and ES modules served by Express; no build step. Four pages
  (Discover, Jobs, Saved, Profile); Jobs is a ranked list with the selected role beside it. A
  tagged-template helper escapes every interpolated value. Light and dark themes.
- **Backend:** Express 4 REST API with a central error handler that returns consistent JSON.
- **Matching engine** (`src/matching/`): deterministic functions with no I/O, unit-tested directly.
- **Storage:** the opportunity catalogue is a JSON file validated at startup. Profile and
  shortlist are kept in `data/store.json` behind a small store module with atomic writes; that
  module is where a database would plug in. The hosted demo has no durable disk, so it swaps in a
  second store with the same interface that keeps each visitor's data in their own HttpOnly
  cookie, validated on every read.
- **External services:** none. The project runs offline.

## Data model

**Profile:** `education {level, field, currentlyEnrolled}`, `experience {totalYears, areas[],
summary}`, `skills[]`, `languages[{language, level}]`, `preferredLocations[]`, `openToRemote`,
`careerInterests[]`, `currentCountry`, `workAuthorisation {status: unknown | specified,
countries[]}`. Levels are ordinal enums. The sample profile follows the brief, with enrolment
set to "no" (a completed degree plus two years of work) and work authorisation "unknown".

**Opportunity:** `id`, `title`, `organisation`, `type`, `location {city, country, region,
workMode}`, `requiredSkills[]`, `preferredSkills[]`, `experience {minYears, maxYears, areas[]}`,
`education {minLevel, fields[]}`, `languages[{language, level, required}]`, `categories[]`,
`eligibility {workAuthorisationRequired, visaSponsorship, enrolledStudentRequired,
residenceRegion, otherRequirements[]}`, `salary`, `postedOn`. A `null` requirement means the
role does not state one. Twelve fictional roles cover strong, partial and poor fits; four carry
hard constraints (professional German, enrolled students only, professional French with a
Master's, residence in Europe).

## Matching method

Rule-based and fully explainable. Six criteria, each scored 0–1:

| Criterion | Weight | Rule |
| --- | --- | --- |
| Skills | 35 | Required 80%, preferred 20%. Exact or synonym = 1; a listed related skill = 0.5 and is named in the explanation |
| Experience | 20 | Years in range = 1, one year short = 0.5; combined 70/30 with relevance of experience areas |
| Education | 15 | Level met = 1, one level below = 0.4; combined 60/40 with field relevance |
| Location | 10 | Preferred country = 1, preferred region = 0.8, same region only = 0.3 |
| Language | 10 | Per requirement: level met = 1, one level below = 0.5; averaged |
| Career interests | 10 | Match with the role's area tags = 1, shared keyword = 0.5 |

**Score** = Σ(weight × score) ÷ Σ(weights of applicable criteria) × 100.

**Missing data.** Role states no requirement → criterion excluded and the rest rescaled. Role
states one but the profile lacks the data → scores 0 and is listed as a gap. No location or
interest preference → not scored. A role scored on less than half of the model is never
labelled "Strong".

**Hard constraints never add points; they raise flags:**

- **Blocker** (mandatory language not held, enrolment required but not enrolled, right to work
  not held and no sponsorship): the role becomes a "critical requirement gap" and ranks after
  all others, whatever its score.
- **Verify** (work authorisation, enrolment or residence unknown; language one level short;
  sponsorship needed): shown as "Needs verification". Ranking is unchanged, because unknown
  authorisation affects almost every international role.
- **Info** (self-reported authorisation, possibly overqualified, low coverage).

Labels: Strong ≥ 75, Partial 50–74, Weak < 50. Ranking: non-blocked first, then score, then
title. Explanations are assembled only from evidence the evaluators recorded, so they cannot
claim anything the scoring did not check.

## Validation and errors

The profile is checked in the browser for fast feedback and authoritatively on the server
(types, ranges, enums, length limits, required skills and languages, unknown fields rejected).
Errors return field paths that the form shows beside the right input. Malformed JSON → 400,
oversized body → 413, unknown id → 404, matches without a profile → 409. A malformed catalogue
stops startup with the entry named; a corrupt store file is set aside and the app starts empty.
Shortlist changes are optimistic and rolled back if the request fails.

## Security and privacy

Prototype: fictional data only, localhost binding, `no-store` API responses, strict
Content-Security-Policy, escaped output, body size limit, and a stateless `/api/match` endpoint
that scores a profile without storing it. A real deployment would add authentication and
per-user authorisation, TLS, a database encrypted at rest with field-level encryption for
sensitive fields, data minimisation, consent, export and deletion rights, a retention policy,
rate limiting, and audit logs that exclude profile contents.

## Testing

49 automated tests (`npm test`): matcher unit tests and API tests against the real app with a
temporary store, plus manual browser checks. See [TEST_EVIDENCE.md](TEST_EVIDENCE.md).

## Trade-offs

- **Rules instead of a learned or language model:** transparent, deterministic, testable and
  free to run, but limited to the vocabulary in `taxonomy.js`.
- **No frontend framework:** nothing to build and few dependencies; a component framework would
  suit a larger interface better.
- **JSON file store:** zero setup, but single-user.
- **Weights are judgement-based**, not learned from outcome data.

## Known limitations and next steps

- Single user, no authentication (out of scope by design).
- Unusual phrasings of a skill will not match. Next step: embedding-based similarity that
  suggests "possibly related" skills, with the rule-based score kept as the explainable
  baseline and used unchanged whenever that service is unavailable.
- Experience is total years plus area tags, not a full work history.
- Requirements are structured data; free-text job adverts are not parsed.
- Weights are fixed; letting users adjust them is a natural extension.
