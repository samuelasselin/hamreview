# Agent Surface + Release Hygiene Implementation Plan (Plan 08)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the agent-facing surface production-grade — defined failure branches, background execution, handoff slicing quality, snappy narration — and stop version drift with CI. Closes spec §C.8 (guidance half), §F.12–19, §G.17–19 (audit #5-guidance, #11, #12).

**Architecture:** Prose changes to `skills/ham-review/SKILL.md` and `commands/ham-review.md` (kept in lockstep), one clause in the hook's `buildReason` (with its test), a GitHub Actions workflow with an inline version-sync gate, `plugin.json` bumped to match `package.json`, and a CHANGELOG.

**Tech Stack:** Markdown (skill/command), plain `.mjs` (hook), GitHub Actions YAML, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-07-07-production-hardening-design.md` (§C.8, §F, §G)

## Global Constraints

- **Skill descriptions state WHEN to use, never a workflow summary** (superpowers:writing-skills SDO). The `description:` frontmatter set in Plan 06 is final — do not touch it.
- **Positive recipes, not prohibition lists**, for behavior-shaping prose (the Narration section especially).
- **Lockstep:** any step 1–7 workflow change in SKILL.md must be mirrored in `commands/ham-review.md`.
- **Node builtins only** in `scripts/` (the installed plugin has no node_modules).
- Depends on Plan 07's runtime behavior (background-safe CLI, leftovers ack, `flowId: "leftovers"` comments, URL always printed). **Execute after Plan 07** — the skill must not document behavior that doesn't exist yet.
- Commits: conventional messages, no AI attribution, no `Co-Authored-By` trailers. Never `git add -A`.
- Test env: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`; commit with `git -c commit.gpgsign=false commit …`.

---

### Task 1: SKILL.md — background run, URL relay, failure branches (§F.12–13; audit #5, #11)

**Files:**
- Modify: `skills/ham-review/SKILL.md` (steps 5–6 and the Requirements section)

**Interfaces:**
- Consumes: Plan 07's CLI behavior — always prints the review URL; exit 0 + `feedback.json` only on real submission; "review was not submitted (aborted in the browser)" on abort.
- Produces: the workflow text Tasks 2–4 build on.

- [ ] **Step 1: Replace step 5 (currently "Open the review (this blocks your turn)…")**

New text:

```markdown
5. **Open the review — in the BACKGROUND (it blocks until the human submits).** From the repo
   root, run `npx -y hamreview handoff.json` as a background task (your shell tool's
   background/async mode — a foreground call gets killed by command timeouts long before a
   real review finishes). The CLI prints the review URL: relay it to the human immediately
   ("Review open at <URL>") in case their browser did not open. Then wait for the process to
   exit; read `feedback.json` only after it exits with code 0.
```

- [ ] **Step 2: Replace step 6 ("Act on the feedback") with the outcome table**

New text:

```markdown
6. **Act on the outcome.**

   | Outcome | What you do |
   |---------|-------------|
   | Exit 0, `feedback.json` present | Read it. Per flow `verdict`: `changes-requested` → address its comments before proceeding; `approved` → the human owns this slice. Per comment `intent`: `must-fix` → make the change; `question` → answer it (and change if warranted); `nit` → optional. Comments with `flowId: "leftovers"` refer to changed files outside every flow — treat them like any other comment. |
   | "review was not submitted" (aborted) | STOP and ask the human how to proceed. Do NOT assume approval. |
   | The command is denied/blocked by a permission gate | Ask the human to allowlist it or run it themselves: `npx -y hamreview handoff.json`. Do not retry blindly. |
   | `HandoffValidationError …` | Fix `handoff.json` per the message and retry ONCE. Still failing → show the human the error and STOP. |
   | "server did not start in time" or any other error | Report the exact stderr to the human and STOP. Never assume approval; never invent feedback. |
```

- [ ] **Step 3: Verify structure**

Run: `grep -n "BACKGROUND\|Do NOT assume approval\|retry ONCE" skills/ham-review/SKILL.md`
Expected: all three match. Also confirm the frontmatter `description:` line is byte-identical to before (`git diff skills/ham-review/SKILL.md | grep "^[-+]description:"` prints nothing).

- [ ] **Step 4: Commit**

```bash
git add skills/ham-review/SKILL.md
git -c commit.gpgsign=false commit -m "docs(skill): background review run, URL relay, and explicit failure branches"
```

---

### Task 2: SKILL.md — slicing quality bar, range verification, leftovers discipline (§F.17–19)

**Files:**
- Modify: `skills/ham-review/SKILL.md` (step 2, step 3, and a new verification step between the current steps 4 and 5)

**Interfaces:**
- Consumes: step numbering after Task 1.
- Produces: the quality bar Task 4 mirrors into the command.

- [ ] **Step 1: Replace step 2 ("Group into flows") with the quality bar**

New text:

```markdown
2. **Group into flows — slice quality is the product.** For each distinct data path
   (typically one endpoint or use case), make a flow: an ordered list of steps in the order
   data moves through the system (e.g. migration → model → endpoint → client → UI — adapt to
   the actual stack). A flow is typically 3–8 steps. `ranges` are the **changed hunks** from
   `git diff HEAD` — never a whole file (the one exception: a file that is entirely new). A
   step's `note` says why the change matters to the flow, not what the code is.

   ❌ `{ "path": "hooks/useBooking.tsx", "ranges": [[1, 612]], "role": "hook" }` — a whole
   edited file is file-by-file review wearing a flow costume.
   ✅ `{ "path": "hooks/useBooking.tsx", "ranges": [[7, 13], [175, 214]], "role": "hook",
   "note": "stages the stay change and exposes it to the panel" }`
```

- [ ] **Step 2: Extend step 3 (leftovers) with the discipline line**

Append to the existing step 3 text:

```markdown
   Leftovers are for lockfiles, generated/build artifacts, pure-docs churn, and mechanical
   renames — never for hand-written logic. The reviewer sees and must acknowledge the
   Leftovers bucket before they can submit, so a lazy leftover is visible, not hidden.
```

- [ ] **Step 3: Insert a new step after "Write handoff.json" (renumber the following steps)**

```markdown
5. **Verify your ranges before opening.** Cross-check every step's ranges against the
   `git diff HEAD` hunks: a range that overlaps no changed line will render a `stale` badge
   and erode the human's trust in the slice. Fix any mismatch now.
```

(The former steps 5–7 become 6–8; update the numbering and any internal references.)

- [ ] **Step 4: Verify structure**

Run: `grep -n "flow costume\|Verify your ranges\|never for hand-written logic" skills/ham-review/SKILL.md`
Expected: all three match, and the step numbers read 1–8 in order (`grep -E "^[0-9]+\." skills/ham-review/SKILL.md`).

- [ ] **Step 5: Commit**

```bash
git add skills/ham-review/SKILL.md
git -c commit.gpgsign=false commit -m "docs(skill): slicing quality bar, range verification, leftovers discipline"
```

---

### Task 3: Narration section + hook prompt alignment (§F.14–15)

**Files:**
- Modify: `skills/ham-review/SKILL.md` (new `## Narration` section after `## Steps`), `scripts/checkpoint-core.mjs` (`buildReason` clause)
- Test: `scripts/checkpoint-core.test.mjs` (extend the `buildReason` test)

**Interfaces:**
- Consumes: `buildReason(summary)` from Plan 06.
- Produces: unchanged signature; the reason text gains the background clause.

- [ ] **Step 1: Extend the buildReason test (failing first)**

In `scripts/checkpoint-core.test.mjs`, extend the existing `buildReason` expectations:

```js
    expect(r).toContain("in the background");
```

Run: `npx vitest run scripts/checkpoint-core.test.mjs` — Expected: FAIL (clause absent).

- [ ] **Step 2: Update `buildReason` in `scripts/checkpoint-core.mjs`**

Change the YES branch line to:

```js
    "  • If YES → invoke the ham-review skill now (run its CLI in the background — it blocks until the human submits).",
```

Run: `npx vitest run scripts/checkpoint-core.test.mjs` — Expected: PASS.

- [ ] **Step 3: Add the Narration section to SKILL.md** (after the `## Steps` section)

```markdown
## Narration

Narrate each step as one short line: the action + the one detail that matters. The human
should be able to scan the margin and watch the review take shape. Match the human's language.

Line shape — `<verb> <the specific>`:
- "Staging changes."
- "Grouping into 3 flows."
- "Writing handoff.json — one flow (the red night), rest → Leftovers."
- "Opening the review in the background — URL relayed, waiting on your submit."

❌ "I have the exact lines. I'll create the flow targeting the red change (the rest goes to
Leftovers). I stage (required by the skill — already staged anyway) and write handoff.json."
✅ "Lines confirmed. One flow = the red change, rest → Leftovers. handoff.json written."
```

- [ ] **Step 4: Run the full suite + verify**

Run: `npm test` — Expected: all green.
Run: `grep -n "## Narration" skills/ham-review/SKILL.md` — Expected: one match.

- [ ] **Step 5: Commit**

```bash
git add skills/ham-review/SKILL.md scripts/checkpoint-core.mjs scripts/checkpoint-core.test.mjs
git -c commit.gpgsign=false commit -m "docs(skill): narration recipe; hook prompt tells the agent to run the review in the background"
```

---

### Task 4: Command lockstep (§F.16)

**Files:**
- Modify: `commands/ham-review.md`

**Interfaces:**
- Consumes: SKILL.md steps as they stand after Tasks 1–3.
- Produces: the command mirrors the workflow.

- [ ] **Step 1: Rewrite the command body** (keep the existing frontmatter `description` untouched)

```markdown
Follow the ham-review skill now for the current uncommitted changes:

1. Run `git add -A` (so newly-created files are included — the review uses `git diff HEAD`,
   which ignores untracked files), then `git diff --no-color HEAD` to see every change.
2. Group all changed files into flows (in data-flow order) — ranges are the changed hunks,
   never whole files; anything not in a flow is a deliberate leftover (lockfiles, generated
   files, docs — never hand-written logic).
3. Write `handoff.json` in the repo root (contract: `{ version:1, root, base:"working-tree",
   feature?, flows[] }`) and verify every range overlaps a real diff hunk.
4. Run `npx -y hamreview handoff.json` **in the background** — it blocks until I submit.
   Relay the printed URL to me immediately.
5. After the process exits 0, read `feedback.json` and act on every comment by its intent and
   each flow's verdict. If I abort, or the command fails for any other reason, stop and tell
   me exactly what happened — never assume approval.
```

- [ ] **Step 2: Verify lockstep**

Run: `grep -n "in the background\|never assume approval\|changed hunks" commands/ham-review.md`
Expected: all three match.

- [ ] **Step 3: Commit**

```bash
git add commands/ham-review.md
git -c commit.gpgsign=false commit -m "docs(command): mirror the skill's background-run and failure-path workflow"
```

---

### Task 5: CI, version sync, CHANGELOG (§G.17–19; audit #12)

**Files:**
- Create: `.github/workflows/ci.yml`, `CHANGELOG.md`
- Modify: `.claude-plugin/plugin.json` (version → match `package.json`)

**Interfaces:**
- Consumes: `package.json` scripts (`test`, `typecheck`, `typecheck:core`, `build`) and its `version` (1.0.1, recorded by Plan 07 Task 4).
- Produces: CI that fails on test/typecheck/build/pack errors and on any `package.json` ↔ `plugin.json` version drift.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run typecheck
      - run: npm run typecheck:core
      - name: version sync (package.json ↔ plugin.json)
        run: |
          node -e '
            const pkg = require("./package.json").version;
            const plugin = require("./.claude-plugin/plugin.json").version;
            if (pkg !== plugin) {
              console.error(`version drift: package.json ${pkg} vs plugin.json ${plugin}`);
              process.exit(1);
            }
            console.log(`versions in sync: ${pkg}`);
          '
      - run: npm run build
      - run: npm pack --dry-run
```

- [ ] **Step 2: Bump `.claude-plugin/plugin.json`** `"version": "1.0.0"` → `"version": "1.0.1"` (must equal `package.json`'s committed version — check it first: `node -p "require('./package.json').version"`).

- [ ] **Step 3: Create `CHANGELOG.md`**

```markdown
# Changelog

## 1.0.1 — 2026-07-07

### Security
- Handoff step paths are contained to the repo root (validation + reader guard).
- Every API route requires a per-run token; cross-origin feedback forgery is no longer possible.

### Fixed
- A stale `feedback.json` from a prior run can no longer be reported as this run's result.
- `SIGTERM`/`SIGHUP` now clean up the server and temp dir; a failed browser-open no longer kills the run.
- `/api/review` failures return actionable error messages, shown in the UI.
- Enclosing context is capped at ±200 lines (flat/generated files no longer freeze the tab).

### Added
- Review-checkpoint Stop hook: the agent is prompted to review at feature-complete checkpoints.
- Leftovers are inspectable and commentable, and must be acknowledged before Send.
- Review state persists across refreshes (sessionStorage) with an unload guard.
- CI (tests, typechecks, build, pack, version-sync gate).

## 1.0.0 — 2026-07-06

- Initial release: flow-sliced, blocking browser review for coding agents (npm CLI + Claude Code plugin).
```

- [ ] **Step 4: Validate locally**

Run the version-sync one-liner from the workflow directly — Expected: `versions in sync: 1.0.1`.
Run: `npx vitest run` (sanity) — Expected: green.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .claude-plugin/plugin.json CHANGELOG.md
git -c commit.gpgsign=false commit -m "chore(release): CI with version-sync gate; plugin.json 1.0.1; CHANGELOG"
```

---

## Self-Review

**1. Spec coverage:** §C.8 guidance→Task 1; §F.12→Task 1; §F.13→Tasks 1+4; §F.14→Task 3; §F.15→Task 3; §F.16→Task 4; §F.17–19→Task 2 (+Task 4 mirror); §G.17→Task 5; §G.18→Task 5; §G.19→Task 5. ✓
**2. Placeholders:** all replacement prose, YAML, and JSON edits are given verbatim; no TBDs. ✓
**3. Consistency:** Task 2's renumbering (insert verify step → steps 1–8) is what Task 3's "after `## Steps`" and Task 4's mirror build on; `buildReason`'s new clause matches SKILL.md step 5's background instruction; the leftovers ack sentence (Task 2) matches Plan 07 Task 7's UI behavior; `flowId: "leftovers"` (Task 1's table) matches Plan 07's contract. ✓

**Ordering:** run this plan only after Plan 07 — Tasks 1, 2, and 4 document runtime behavior Plan 07 introduces.
