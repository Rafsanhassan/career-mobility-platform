# Test evidence

All results below come from the sample profile in the brief (`data/sample-profile.json`) and the
12 opportunities in `data/opportunities.json`. Reproduce them with `npm test` and `npm run demo`.

## 1. Required test cases

### Strong match: Programme Assistant, international NGO (opp-001)

`npm run demo -- opp-001`

- **Score 100/100, Strong match, Needs verification.**
- Skills 35/35: has 3 of 3 required skills (reporting, project coordination, stakeholder
  communication) and both preferred skills (Excel, research).
- Experience 20/20: 2 years meets the 1–2 year requirement; directly relevant project support.
- Education 15/15: Bachelor's meets the minimum; Business Administration fits the business background.
- Location 10/10 (Berlin, Germany is preferred). Language 10/10 (professional English). Interests 10/10.
- Flag (verify): *Requires the right to work in Germany. Your work authorisation is not
  specified, so it needs verification. The employer states that visa sponsorship may be
  available. This is not a legal determination.*

Expected and observed: ranked #1. The unknown work authorisation is surfaced, not treated as satisfied.

### Partial match: Research Assistant, remote Europe (opp-008)

`npm run demo -- opp-008`

- **Score 65/100, Partial match, Needs verification.**
- Skills 23.3/35: has research and report writing (synonym of reporting); data analysis is
  credited at half because the candidate lists the related skill Excel, and the explanation says
  so; preferred skill Stata missing.
- Experience 14/20: years fit, but no research experience listed.
- Education 9/15: degree level met; field (Business Administration) is outside the preferred
  social science or economics.
- Location 9/10: remote role open to applicants in Europe, which includes Germany.
- Interests 0/10: research and public policy are outside the stated interests.
- Flag (verify): applicants must be based in Europe and the country of residence is not specified.

### Critical requirement gap: German-speaking Client Associate (opp-003)

`npm run demo -- opp-003`

- **Score 48/100, Critical requirement gap**, listed in the separate "critical requirement gap"
  section after all recommended roles.
- Flag (blocker): *Professional German is a mandatory requirement for this role and is not met by
  your profile.*
- Gaps: missing required skills customer support and CRM; no customer-support experience.
- Education is "not scored" because the role states no education requirement; the remaining
  criteria are rescaled (e.g. skills is worth 41.2 points instead of 35).

### Second hard constraint: Business Analyst Intern (opp-002)

- **Score 73/100, but Critical requirement gap.** A good skills fit does not hide the eligibility
  rule.
- Flag (blocker): *This role is only open to currently enrolled students, and your profile says
  you are not currently enrolled.*
- Flag (verify): Canadian work authorisation unknown and the employer offers no sponsorship.
- Flag (info): 2 years of experience against a 0–1 year target (may be more junior than needed).

## 2. Full ranking for the sample profile

`npm run demo`

```
Rank | Score | Label                    | Eligibility | Opportunity
-----|-------|--------------------------|-------------|------------
   1 |   100 | Strong match             | verify      | Programme Assistant (opp-001)
   2 |    97 | Strong match             | verify      | Business Operations Associate (opp-011)
   3 |    97 | Strong match             | verify      | Operations Coordinator (opp-004)
   4 |    97 | Strong match             | verify      | Project Support Officer (opp-005)
   5 |    86 | Strong match             | verify      | Programme Officer (Bengali-speaking) (opp-012)
   6 |    65 | Partial match            | verify      | Research Assistant (Remote, Europe) (opp-008)
   7 |    54 | Partial match            | verify      | Junior Data Analyst (opp-006)
   8 |    29 | Weak match               | verify      | Backend Software Engineer (opp-009)
   9 |    25 | Weak match               | verify      | Marketing & Communications Associate (opp-010)
  10 |    73 | Critical requirement gap | blocked     | Business Analyst Intern (opp-002)
  11 |    48 | Critical requirement gap | blocked     | German-speaking Client Associate (opp-003)
  12 |    24 | Critical requirement gap | blocked     | Senior Programme Manager – Humanitarian Response (opp-007)
```

Every role shows "verify" because the sample candidate's work authorisation is unknown, as the
brief specifies. The Bengali-speaking Programme Officer scores well on skills and language but
loses location points (Bangladesh is not a preferred country).

## 3. Automated tests

`npm test` runs 49 tests in 10 suites with Node's built-in test runner. Result: **49 passed, 0 failed.**

```
▶ Required test cases (sample profile from the brief)
  ✔ STRONG MATCH: Programme Assistant at an international NGO
  ✔ PARTIAL MATCH: Research Assistant (remote, Europe)
  ✔ CRITICAL GAP (language): German-speaking Client Associate
  ✔ CRITICAL GAP (eligibility): Business Analyst Intern requires current enrolment
  ✔ POOR MATCH: Backend Software Engineer ranks low
▶ Ranking
  ✔ roles with a critical gap are ranked after all other roles
  ✔ non-blocked roles are sorted by score, and strong matches lead
  ✔ is deterministic
  ✔ breakdown points add up to the score
▶ Missing data handling
  ✔ a requirement the role does not state is excluded, not counted as met or failed
  ✔ missing profile data scores zero for that criterion and is reported as a gap
  ✔ no location preference means location is not scored
  ✔ unknown enrolment status is flagged for verification, not assumed
▶ Work authorisation
  ✔ self-reported authorisation in the role country is noted as unverified
  ✔ authorisation for other countries only, with no sponsorship, is a critical gap
  ✔ sponsorship available turns the gap into a verification flag
▶ Criterion details
  ✔ skill synonyms are recognised (MS Excel = Excel, report writing = reporting)
  ✔ a related skill earns half credit and is named in the explanation
  ✔ language one level below a hard requirement is a verification flag, two levels below is a blocker
  ✔ an optional language that is not met lowers the score but does not block
  ✔ education below the minimum level is a gap
  ✔ being well above the experience range is noted, not hidden
▶ Edge cases
  ✔ non-Latin language names are compared correctly, not collapsed to an empty key
  ✔ accents are ignored when comparing languages
  ✔ work authorisation required but no country stated is flagged, not silently passed
  ✔ unknown sponsorship policy is a verification flag, not a blocker
  ✔ field of study must match whole words ("IS" does not match "business")
  ✔ a role that can only be scored on a small part of the model is never labelled strong
  ✔ open to remote with no preferred locations does not penalise on-site roles
  ✔ a residence country the system does not recognise is flagged for verification, not blocked
▶ End-to-end user journey over the API
  ✔ matches require a profile first
  ✔ lists at least 10 opportunities
  ✔ saves a valid profile, then returns ranked, explained matches
  ✔ returns detail for one match
  ✔ shortlist: add, add again (idempotent), list, remove
  ✔ shortlist status: mark as applied, reject invalid status and unsaved roles
  ✔ shortlist rejects unknown opportunities
▶ Validation and errors
  ✔ rejects a profile with no skills and no languages, with field paths
  ✔ rejects invalid values (negative years, unknown language level, unknown field)
  ✔ "specified" work authorisation needs at least one country
  ✔ malformed JSON returns a clean 400
  ✔ unknown opportunity returns 404
  ✔ stateless /api/match validates and does not store the profile
  ✔ API responses are not cacheable and carry security headers
▶ Data loading
  ✔ a malformed opportunity file fails fast with a clear message
▶ Hosted demo mode (per-visitor cookie store)
  ✔ full journey works with state carried in the cookie
  ✔ visitors never see each other’s data
  ✔ a tampered or invalid cookie is ignored, not trusted
  ✔ a profile too large for a cookie is rejected with a clear message
ℹ tests 49
ℹ pass 49
ℹ fail 0
```

The API tests start the real Express app on a random port with a temporary data folder, so they
exercise routing, validation, persistence and error handling end to end without touching local data.

## 4. Manual UI checks (browser)

| Check | Result |
| --- | --- |
| Discover without a profile | Shows the latest roles, a prompt to create a profile, and no fit scores |
| Submit an empty profile | Blocked; "Add at least one skill" and "Add at least one language" shown next to the fields |
| Tag inputs | Enter or comma adds a tag, duplicates are ignored, × removes; the profile-strength panel updates as fields change |
| Load sample profile, save | Opens Jobs ranked by fit: 12 roles, 5 strong, 3 below the "hard requirement not met" divider |
| Discover with a profile | "Your top matches" board, top three picks, and destinations with preferred countries first |
| Jobs list | Each row shows the role, organisation, location, one-line reason, fit ring, rank and eligibility status |
| Selecting a role | Detail opens beside the list without reloading it; the address changes to `#/jobs/<id>` and can be opened directly |
| Search and filters | Text search, location, job type, fit (Strong, Partial, Saved) and sort (best fit, newest) each return the expected roles |
| Detail (opp-003) | Fit card, blocker and verification flags with the legal disclaimer, each skill marked held, related or missing, per-criterion points; education shown as "Not scored" |
| Save / unsave | Button state, header count and Saved page stay in sync; state persists after server restart |
| Rapid repeated clicks on Save | UI and server end in the same state |
| Saved page | With three roles saved, the side-by-side table shows score, eligibility, each criterion and pay; "Mark as applied" adds the applied stamp and can be undone |
| Phone width (375 px) | List and detail become separate screens with a back link; no horizontal scroll on any page |
| Light and dark themes | Both render correctly; the header toggle switches and remembers the choice |
| Browser console | No errors |
| Live demo | Home, profile save, ranked matches, save, mark as applied and reload all work on the hosted site; a second visitor sees an empty profile |
