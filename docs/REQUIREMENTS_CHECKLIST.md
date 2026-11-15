# Requirements checklist

How each item in the assessment brief is met, and where to find it.

## 01 · Product challenge

| Requirement | Where |
| --- | --- |
| Create a user profile (education, skills, experience, languages, preferred locations, career interests) | Profile page (`#/profile`), `public/js/views/profile.js`, `profileSchema` |
| Display opportunities (title, organisation, location, required skills, experience level, language or eligibility requirements) | Jobs page (`#/jobs`): searchable list, with full requirements in the detail pane beside it |
| Match and rank | `src/matching/matcher.js` → Jobs page sorted by best fit (the default), and "Your top matches" on Discover (`#/`) |
| Explain recommendations (strengths, gaps, eligibility concerns) | One-line reason on every list row; "Your fit" card with summary, meters, "Why it fits" and "Gaps"; eligibility flags; full points breakdown |
| View details and save or shortlist | Detail pane (`#/jobs/<id>`); Save button on every role; Saved page (`#/saved`) with side-by-side comparison and an "applied" marker |

## 02 · Functional requirements

| Area | Minimum expectation | Status |
| --- | --- | --- |
| Profile | Form to enter and edit a profile | Met. Six-section form, client and server validation, live profile-strength panel, edit at any time |
| Opportunity data | At least 10 structured opportunities | Met. 12 in `data/opportunities.json`, schema-validated on startup |
| Matching logic | Repeatable scoring and ranking | Met. Deterministic weighted model; determinism is unit-tested |
| Match explanation | Short explanation with matched criteria and gaps | Met. Generated only from recorded evidence |
| Opportunity details | Requirements plus match information | Met. Requirements beside score ring, flags and per-criterion points |
| Shortlisting | Save or shortlist | Met. Persisted on the server, optimistic UI with rollback; saved roles can be marked as applied |

## 03 · Matching logic

| Must consider | How |
| --- | --- |
| Skills | Required and preferred overlap, synonyms, half credit for related skills (35 points) |
| Experience | Years against the stated range plus relevance of experience areas (20) |
| Education | Minimum level plus field relevance (15) |
| Location | Preferred country, preferred region, remote (10) |
| Language | Each requirement compared by level (10) |
| Eligibility | Work authorisation, enrolment, residence and mandatory languages raise blocker or verify flags; never silently satisfied |
| Understand why a score was given | Per-criterion points always add up to the score |
| No inferred visa status presented as fact | Unknown status is labelled "Needs verification" and every message says it is not a legal determination |

Matching is entirely rule-based and runs locally with no external model or service, so there is no unreliable output to validate and no outage to handle.

## 04 · Sample data

| Requirement | Status |
| --- | --- |
| Sample profile from the brief | `data/sample-profile.json`; one click on "Load sample profile" |
| Work authorisation treated as unknown | Yes; flagged on every role that requires it |
| At least 10 fictional opportunities | 12 |
| Strong, partial and poor matches | 5 strong, 2 partial, 2 weak for the sample profile |
| At least two with a clear eligibility or language constraint | 4: opp-002 (enrolled students, local work eligibility), opp-003 (professional German), opp-007 (professional French, Master's), opp-008 (residence in Europe) |
| The three example roles from the brief | opp-001 Programme Assistant, opp-002 Business Analyst Intern, opp-003 German-speaking Client Associate |

## 05 · Technical expectations

| Topic | Where |
| --- | --- |
| Architecture | [TECHNICAL_NOTE.md](TECHNICAL_NOTE.md), Architecture |
| Data | [TECHNICAL_NOTE.md](TECHNICAL_NOTE.md), Data model; `src/validation/schemas.js` |
| Validation and errors | [TECHNICAL_NOTE.md](TECHNICAL_NOTE.md), Validation and errors; API tests |
| Security and privacy | [TECHNICAL_NOTE.md](TECHNICAL_NOTE.md), Security and privacy; only fictional data is used |
| Testing | `npm test` (45 tests); [TEST_EVIDENCE.md](TEST_EVIDENCE.md) |
| Maintainability | Layered `src/` structure; setup in the [README](../README.md) |
| External API with fallback | Not applicable: no external API is used |

## 06 · Deliverables

| Deliverable | Where |
| --- | --- |
| Working application | `npm install && npm start`, then http://localhost:3000 |
| Source code with README | This folder; [README.md](../README.md) |
| Technical note | [TECHNICAL_NOTE.md](TECHNICAL_NOTE.md) |
| Test evidence (strong, partial, critical gap) | [TEST_EVIDENCE.md](TEST_EVIDENCE.md) |
| AI/tool disclosure | [AI_TOOL_DISCLOSURE.md](AI_TOOL_DISCLOSURE.md) |
