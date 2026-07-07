# HamReview — Production Hardening Design Spec

- **Date:** 2026-07-07
- **Status:** Draft — pending user review
- **Depends on:** the `ham-review` plugin + CLI on `main`; the review-checkpoint hook branch (Plan 06).
- **Source:** the 2026-07-07 production-readiness audit (5 Blockers, 7 Important, 3 Polish) plus an analysis of the agent-facing surfaces (SKILL.md, command, hook prompt).
- **Goal:** close every Blocker and Important finding so the product is safe and dependable for its real audience — coding agents driving long, blocking, browser-based reviews.

## Purpose

The audit proved (live, against the running server) that a hostile `handoff.json` can read arbitrary files, that feedback can be forged cross-origin, and that several ordinary events — a refresh, a harness timeout, an abort after a prior review — silently destroy or falsify review results. Separately, the skill gives the agent no defined behavior for its most common failure modes. This spec hardens the trust boundary (handoff in, feedback out), makes review state durable, and gives the agent surface explicit failure paths.

## Scope

Audit findings **#1–#12** (all Blockers + all Important) and the agent-surface improvements. Polish findings #13–#15 are non-goals except where a fix lands them for free.

Implementation is split into **two plans**:
- **Plan 07 — runtime hardening** (server/CLI/UI: findings #1–#10)
- **Plan 08 — agent surface + release hygiene** (skill/command/hook prompt/CI: findings #5-guidance, #11, #12)

## Decisions

### A. Trust boundary — hostile `handoff.json` (#1, #2, #3)

1. **Path containment (fixes #1).** At handoff validation time, reject any step `path` that escapes `root` after resolution (`resolve(root, path)` must start with `resolve(root) + sep`) — fail fast with the offending paths named. Defense in depth: `makeFileReader` re-checks containment and returns `[]` for any escaping path, so a bug upstream can never read outside the repo.
2. **Per-run token (fixes #2).** The CLI generates a random token (`crypto.randomBytes`), passes it to the server via env, and opens the browser at `/?token=…`. The UI holds it in memory and sends it as an `X-HamReview-Token` header on **every** `/api/*` call (including `GET /api/review`, which serves file contents). The server rejects any request with a missing/wrong token (403). Cross-origin pages cannot read the URL of another tab, so a blind CSRF POST can no longer forge feedback or abort.
3. **No stale results (fixes #3).** At startup the CLI deletes any pre-existing `feedback.json` at its output path. Success is reported **only** on the server's explicit "submitted" completion signal — never inferred from `feedback.json` existing. The abort path exits with the current non-zero "review was not submitted" behavior regardless of leftover files.

### B. Durable review state (#4)

4. **Autosave to `sessionStorage`** on every state change (comments + verdicts), rehydrate on mount. The server's per-run random port gives each run a distinct origin, so rehydration naturally scopes to the same run: refresh restores everything, a new run starts clean.
5. **`beforeunload` guard** when there are comments or undecided flows, so closing/refreshing warns instead of silently discarding (refresh then restores anyway via 4).

### C. Process lifecycle (#5, #6, #8)

6. **Signal handling (fixes #6).** `SIGTERM` and `SIGHUP` get the same cleanup as `SIGINT` (kill the spawned server, remove the temp dir, exit non-zero "review was not submitted").
7. **Browser-open never kills the run (fixes #8).** Wrap `open(url)` so any failure (headless env, no opener) logs `open this URL in a browser: <url>` and the run continues. The URL is always printed to stdout, success or not, so the agent can relay it to the human.
8. **Harness-timeout accommodation (fixes #5, guidance half).** The runtime cannot stop a harness from killing it; the skill must tell the agent to run the CLI **in the background** and poll (see F). Runtime side: on `SIGTERM` (the typical timeout kill) the exit message names the likely cause: `review interrupted — if this was a command timeout, re-run in the background`.

### D. Failure visibility (#7)

9. **`GET /api/review` catches errors** and returns `{ error: <actionable message> }` with a proper status; the UI shows the actual message (bad `root`, not-a-repo, unreadable handoff) instead of the generic "Failed to load the review."

### E. Review completeness & scale (#9, #10)

10. **Context cap (fixes #9).** `enclosingContext` spans at most ±200 lines around the changed range; the UI labels truncation ("… N more lines above"). DOM virtualization is deferred (Polish).
11. **Leftovers become reviewable (fixes #10).** The Leftovers bucket becomes a selectable panel listing each leftover file with its changed ranges rendered read-only and commentable. **Send requires acknowledging Leftovers** (an explicit "reviewed leftovers" acknowledgment alongside per-flow verdicts) whenever the bucket is non-empty — making "nothing escapes review" true instead of aspirational.

### F. Agent surface — skill, command, hook prompt (#5, #11)

12. **Failure branches in SKILL.md (fixes #11).** Step 6 gains an explicit decision table: permission-denied on `npx` → ask the human to allowlist or run it themselves (with the exact command); validation error → fix `handoff.json` and retry once; server-start failure / unknown non-zero exit → report stderr to the human and STOP — never assume approval, never retry blindly.
13. **Background execution (fixes #5).** SKILL.md step 5 changes from "run `npx -y hamreview handoff.json`" to: run it **in the background**, relay the printed URL to the human, then poll for completion (process exit) and only read `feedback.json` after a successful exit. The command file mirrors this.
14. **Narration recipe.** SKILL.md gains a short "Narration" section (positive recipe, per prior user feedback): one line per step, `<verb> + the one specific that matters`, matching the user's language — with one ❌/✅ example pair. No prohibition lists.
15. **Hook prompt alignment.** `buildReason` adds one clause so the agent runs the review the right way from the hook path too: "invoke the ham-review skill now (run its CLI in the background — it blocks until the human submits)".
16. **Lockstep rule.** `commands/ham-review.md` is regenerated to mirror the skill's steps 5–6 changes verbatim-in-spirit; a checklist item in the plan enforces it.
17. **Slicing quality bar (handoff quality).** SKILL.md step 2 gains concrete guidance — the product stands on slice quality, and real transcripts show whole-file dumping: ranges are the **changed hunks** from `git diff HEAD`, never whole files (a fully new file is the one exception); a flow is typically 3–8 steps; a step's `note` says why the change matters to the flow, not what the code is. Include one ❌/✅ example pair (❌ `"ranges": [[1, 612]]` on an edited file → ✅ the actual hunk ranges).
18. **Range verification step.** Before opening the review, the agent cross-checks every step's ranges against the `git diff HEAD` hunks; any range with no overlap with changed lines must be fixed — it would render a `stale` badge and erode the human's trust in the slice.
19. **Leftovers discipline.** One line in SKILL.md defining what belongs in Leftovers (lockfiles, generated/build artifacts, pure-docs churn, mechanical renames) and what never does (any hand-written logic).

### G. Release hygiene (#12)

17. **CI workflow** (`.github/workflows/ci.yml`): on push/PR — `npm ci`, `npm test`, `npm run typecheck`, `npm run typecheck:core`, `npm run build`, `npm pack --dry-run`.
18. **Version sync check** in CI: fail if `package.json` and `.claude-plugin/plugin.json` versions differ. Bump `plugin.json` to match the pending `1.0.1`.
19. **CHANGELOG.md** started at `1.0.1`, one entry per released version going forward.

## Error handling

- Token mismatch → 403 JSON `{ error: "invalid or missing review token" }`; UI shows a "restart the review" message.
- Containment rejection at validation → CLI exits non-zero listing every offending path; reader-level rejection is silent (`[]`) but logged to server stdout.
- `sessionStorage` unavailable (disabled) → the app runs exactly as today (in-memory only); no crash.
- All new failure paths keep the CLI's existing contract: non-zero exit + "review was not submitted" whenever feedback was not durably submitted.

## Testing

- **Containment:** unit tests for the validator (traversal via `..`, absolute paths, symlink-free normalization) and for `makeFileReader` (escaping path → `[]`).
- **Token:** route tests — wrong/missing token → 403 on all `/api/*`; correct token → 200. UI sends the header (component or integration test).
- **Stale feedback:** integration test — pre-existing `feedback.json` + abort → non-zero exit, no success message, file not reported as this run's result.
- **Signals:** spawn the CLI, send `SIGTERM`, assert child server is gone and temp dir removed.
- **Context cap:** unit test — flat 50k-line file, 1-line change → range ≤ 401 lines with truncation flags.
- **Leftovers gating:** state test — leftovers non-empty + all flows decided but unacknowledged → Send disabled.
- **/api/review errors:** route test — bad `root` → 4xx/5xx with actionable `error` body.
- **CI:** the workflow itself is validated by the branch's own runs; the version-sync check has a unit test.
- **Skill changes** are prose — validated by review, plus one live e2e (human step) exercising the background-run + URL-relay path.

## Non-goals

- Polish findings **#13** (tarball slimming), **#14** (friendlier ENOENT / size cap), **#15** (CLI + component test scaffolding beyond the tests listed above) — tracked, not in these plans.
- DOM virtualization of `FlowStep` (cap covers the failure mode; virtualization is an optimization).
- Authentication beyond the per-run token (single-user localhost tool).
- Multi-review concurrency, review resume across runs, opt-out for the checkpoint hook (unchanged from Plan 06).
- **A structured answer channel for `question` comments.** Today the agent's answers to review questions live only in chat, invisible to the review record — a real product gap, but a v2 design question (it changes the feedback contract), not a hardening fix. Tracked here so it isn't lost.

## Success criteria

- A `handoff.json` naming any path outside `root` cannot cause any byte outside `root` to be read or served — proven by the same live probe the audit used.
- A cross-origin POST to `/api/feedback` or `/api/abort` is rejected; forged feedback is impossible without the run's token.
- Abort after a prior successful review in the same directory reports failure, never stale success.
- A mid-review refresh loses nothing; a harness `SIGTERM` leaves no orphaned server and no zombie temp dir.
- An agent following the updated skill: runs the review in the background, relays the URL, handles every failure branch without assuming approval, and narrates in one-line steps.
- Handoffs produced by the updated skill use hunk-level ranges — no whole-file ranges for edited files — and every range overlaps real changed lines.
- CI is green on the branch, and versions cannot drift silently again.
