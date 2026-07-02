# FlowReview

Review AI-generated code by the flow of data, not file-by-file.

## Requirements
- Node.js ≥ 20 (Next.js 15 / Vitest 3).

## Develop
```bash
npm install
npm test            # unit + integration tests
npm run typecheck   # app
npm run typecheck:core  # guards the core stays DOM-free
npm run build       # production build (required before `review`)
```

## Review a change set
An agent (or you) writes a `handoff.json` describing the flows (see
`docs/superpowers/specs`), then:
```bash
npm run build                 # once, or after code changes
npm run review -- handoff.json
```
This reconciles the handoff against `git diff`, opens the review in your
browser, blocks until you submit, and writes `feedback.json` next to where
you ran it. The agent then reads `feedback.json` and acts.
