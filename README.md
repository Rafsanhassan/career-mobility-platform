# Career Mobility Platform (prototype)

The Career Mobility Platform is a working prototype of an international job-search product for people looking for work across
borders. You add a career profile, and every role is scored against it. You get a ranked list of
jobs, each with a transparent score, the reasons it fits, the gaps, and any eligibility checks
to make before applying. Roles can be opened, saved, compared and marked as applied.

All data is fictional.

**Live demo:** https://career-mobility-platform-one.vercel.app

| Document | Contents |
| --- | --- |
| [docs/TECHNICAL_NOTE.md](docs/TECHNICAL_NOTE.md) | Architecture, data model, matching method, trade-offs, limitations |
| [docs/TEST_EVIDENCE.md](docs/TEST_EVIDENCE.md) | Test cases (strong, partial, critical gap), automated test results, manual UI checks |
| [docs/REQUIREMENTS_CHECKLIST.md](docs/REQUIREMENTS_CHECKLIST.md) | Each requirement in the brief mapped to where it is met |
| [docs/AI_TOOL_DISCLOSURE.md](docs/AI_TOOL_DISCLOSURE.md) | AI tools, libraries and external APIs used |

## Quick start

Requirements: **Node.js 20 or newer** (tested on Node 22). No database, API keys or build step.

```bash
npm install
npm start
```

Open http://localhost:3000, go to **Create profile**, click **Load sample profile**, then
**Save and see my matches**.

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app at http://localhost:3000 |
| `npm run dev` | Same, restarting on file changes |
| `npm test` | Runs the unit and API test suite (Node's built-in test runner) |
| `npm run demo` | Prints the ranked results for the sample profile in the terminal |
| `npm run demo -- opp-003` | Prints the full explanation for one opportunity |

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (localhost only by default) |
| `DATA_DIR` | `./data` | Folder for `store.json` (saved profile and saved jobs) |

The saved profile and saved jobs live in `data/store.json`, created on first save and
git-ignored. Delete it to reset the app.

### Hosted demo

The live demo runs on Vercel, which has no durable disk. There, each visitor's profile and
saved jobs are kept in their own HttpOnly browser cookie (`src/data/cookieStore.js`), so the
server is stateless and visitors never see each other's data. Everything read back from the
cookie is validated again. The entry point is `api/index.js` and the hosting configuration is
`vercel.json`; running locally with `npm start` is unaffected and uses the file store.

## The product

| Page | Address | What it does |
| --- | --- | --- |
| **Discover** | `#/` | Search box, a board of your top matches (or the latest roles before you have a profile), your three best picks, and destinations with your preferred countries first |
| **Jobs** | `#/jobs` | Search and filters (location, job type, fit, saved) over a list ranked by fit, with the selected role's full detail beside it. Roles with an unmet hard requirement sit below a divider |
| **Job detail** | `#/jobs/<id>` | "Your fit" card with score, reasons and gaps; eligibility flags; description; requirements with each skill marked held, related or missing; a points breakdown that adds up to the score |
| **Saved** | `#/saved` | Saved roles, a side-by-side comparison when there are two or more, and a "Mark as applied" marker |
| **Profile** | `#/profile` | Education, experience, skills, languages, preferred locations, career interests, enrolment and work authorisation, with a live profile-strength panel |

The product works without a profile (browse and search), and becomes personalised once one is
saved. The interface follows the system light or dark theme, with a toggle in the header, and
adapts to phone widths, where the list and the detail become separate screens.

## Project structure

```
data/
  opportunities.json      12 fictional opportunities (validated on startup)
  sample-profile.json     the sample candidate from the brief
src/
  server.js               entry point (port, host, data dir)
  app.js                  Express app: REST API, security headers, error handling
  matching/
    taxonomy.js           weights, levels, synonyms, related skills, regions (plain data)
    normalize.js          text normalisation and phrase comparison helpers
    criteria.js           one evaluator per criterion + eligibility rules
    matcher.js            scoring, labels, explanations, ranking
  validation/schemas.js   zod schemas for profile and opportunity data
  data/
    opportunityRepository.js   loads and validates the catalogue
    store.js                   JSON-file store for profile and saved jobs (local)
    cookieStore.js             per-visitor cookie store (hosted demo)
api/index.js              entry point for the hosted demo
vercel.json               hosting configuration
public/                   static frontend (HTML, CSS, ES modules; no build step)
  styles.css              design tokens, components, light and dark themes
  js/main.js              router, shared state, save button, theme toggle
  js/format.js            shared display helpers (score ring, meters, pills, avatars)
  js/dom.js               escaping template helper
  js/api.js               fetch wrapper
  js/views/home.js        Discover
  js/views/jobs.js        Jobs: search, filters, ranked list
  js/views/jobDetail.js   job detail pane
  js/views/saved.js       Saved jobs and comparison
  js/views/profile.js     profile form
test/                     node:test suites for the matcher and the API
scripts/demo.js           terminal demo of the ranking
docs/                     technical note, test evidence, requirements checklist
```

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/opportunities` | All opportunities (with `shortlisted` flag) |
| GET | `/api/opportunities/:id` | One opportunity |
| GET | `/api/profile` | Saved profile (or `null`) |
| PUT | `/api/profile` | Validate and save the profile (400 with field-level `issues` on error) |
| DELETE | `/api/profile` | Delete the saved profile |
| GET | `/api/profile/sample` | The sample profile from the brief |
| GET | `/api/matches` | Ranked matches for the saved profile (409 if there is no profile) |
| GET | `/api/matches/:id` | Opportunity plus full match detail |
| POST | `/api/match` | Stateless: rank opportunities for a profile in the request body, nothing stored |
| GET | `/api/shortlist` | Saved opportunities with current match and status |
| POST | `/api/shortlist` | Body `{ "opportunityId": "opp-001" }`; 201 when added, 200 if already saved |
| PATCH | `/api/shortlist/:id` | Body `{ "status": "saved" \| "applied" }`; 404 if not saved |
| DELETE | `/api/shortlist/:id` | Remove from saved (404 if not saved) |

Errors always come back as JSON: `{ "error": "<code>", "message": "...", "issues": [...] }`.

## Adding or editing opportunities

Edit `data/opportunities.json`. Each entry is validated against `opportunitySchema` in
`src/validation/schemas.js` when the server starts; a malformed entry stops startup with a
message naming the entry and field. To teach the matcher a new synonym or related skill, add it
to `src/matching/taxonomy.js`; no scoring code needs to change.

## Libraries and tools

| Item | Used for |
| --- | --- |
| Node.js 22 | Runtime; built-in `node:test` for testing |
| Express 4 | HTTP server and routing |
| zod 3 | Input and data validation |
| Vercel | Hosting for the live demo |

No external APIs, fonts or paid services are used by the application. The matching is fully rule-based and runs
locally, so the project works offline.
