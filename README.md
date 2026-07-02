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
This reconciles the handoff against `git diff`, opens the **focus-mode review**
in your browser (one flow at a time: a progress rail, enclosing-context steps
with collapsed shared-code and stale/partial badges, and line comments with
intent), blocks until you submit, and writes `feedback.json` next to where you
ran it. Give each flow a verdict (Approve / Request changes), add line comments,
then **Send to agent** — or **Abort review** to release the agent without
feedback. The agent then reads `feedback.json` and acts.

## Install as a global tool

```bash
npm run build      # build the app once
npm i -g .         # (or: npm link) — installs the `flowreview` bin globally
```

Now `flowreview <handoff.json>` works from any project: it serves the review UI
from its own install location, reads that project's `git diff` via the handoff's
`root`, and writes `feedback.json` into your current directory.

## Use it from a coding agent (Claude Code)

Install the integration files (`integrations/claude-code/`):
- the **`flow-review` skill** — your agent invokes it at a checkpoint: it groups
  its uncommitted changes into data-flow slices, writes `handoff.json`, runs
  `flowreview handoff.json` (which blocks until you submit), then reads
  `feedback.json` and acts on your comments and per-flow verdicts.
- the **`/flow-review` command** — run it yourself to demand a review of the
  agent's current changes on the spot.

Every changed file is accounted for — grouped into a flow or surfaced in the
**Leftovers** bucket — so nothing escapes review.
