# AI and tool disclosure

## AI tools

**Claude Code (Anthropic), an AI coding assistant.** I used it extensively throughout this
assignment. Specifically, it:

- generated the application code under my direction: the Express API, the matching engine,
  the validation schemas, the JSON store and the frontend;
- drafted the 12 fictional opportunities and the sample profile file from the brief;
- wrote the automated tests and ran them;
- performed a code review pass, which found 12 issues; 11 were fixed and one was kept as a
  deliberate design choice (missing experience or education is scored as a gap, not raised as
  an eligibility flag);
- designed and tested the interface in a browser at desktop and phone widths;
- drafted the README, technical note, test evidence and requirements checklist.

My role was to set the requirements from the brief, direct the work and its revisions, review
the output and run the application. I have read the code and can explain and modify any part
of it.

No AI service is used by the application itself. The matching is rule-based and runs locally,
so no profile data is sent to any model or third party.

## Libraries

| Library | Purpose |
| --- | --- |
| Node.js 22 | Runtime and built-in test runner (`node:test`) |
| Express 4 | HTTP server and routing |
| zod 3 | Validation of profile input and opportunity data |

## External APIs

None. The project runs fully offline, with no external fonts, scripts or services.
