# FlowReview — Claude Code Integration Design Spec (Plan 4)

- **Date:** 2026-07-02
- **Status:** Approved for planning
- **Depends on:** Plan 1 (core, on `master`), Plan 2 (app + CLI, `plan-02-app-cli`), Plan 3 (review UI, `plan-03-review-ui`). Plan 4 builds on the tip of that stack.

## Purpose

Make FlowReview usable *from inside a coding-agent session*: the agent, at a natural checkpoint, groups the code it just wrote into data-flow slices, opens the review in the human's browser, blocks until the human submits, and acts on the returned feedback — the Plannotator-style loop, with the flow-based view. This is the "first consumer" of the agent-agnostic CLI; the CLI itself stays agent-neutral.

## Decisions

### 1. Global CLI packaging
`flowreview` becomes a globally installable / `npx`-runnable bin so it can review **any** project, not just the flowreview repo.

- The Next app serves from **its own install location** (its bundled `.next` build), independent of which project is under review.
- The project under review is identified by `handoff.json`'s `root` (used for `git diff` and file reads) and by the **invoking working directory** (where `feedback.json` is written).
- Requirements: build `.next` at publish time (a `prepack`/build step); a `package.json` `files` allowlist that ships `.next`, `app`, `src`, `bin`, and configs; the CLI spawns `next start` with **cwd = the package's own directory** (so it finds its build), while keeping `feedbackOut` = the **invoking** cwd (the target project).

### 2. `flow-review` skill — agent-invoked (the load-bearing loop)
A `SKILL.md` (installable as a Claude Code skill) that guides the coding agent, at a checkpoint, through:

1. Run `git diff` in the current project to see its own uncommitted changes.
2. **Group** the changes into flows — one flow per distinct data path (e.g. one endpoint / use case), each an ordered list of steps `{ role, path, ranges, note? }` in data-flow order (migration → model → endpoint → client → UI, or whatever the stack dictates). Grouping comes from understanding the code, not language rules.
3. Account for **every** changed file (see §4).
4. Write `handoff.json` (the Plan 1 contract: `{ version, root, base:"working-tree", feature?, flows[] }`).
5. Run `flowreview handoff.json`. This **blocks the agent's turn** natively (a long-running shell call) until the human submits in the browser.
6. Read `feedback.json` and act: per comment `intent` (🔴 must-fix → change it; ❓ question → answer, change if warranted; 💡 nit → optional) and per-flow `verdict` (`changes-requested` → address; `approved` → proceed). Re-checkpoint (repeat) if further review is warranted.

### 3. `/flow-review` slash command — human-invoked
A thin command that triggers the same loop on demand ("review my current changes now"), for when the human wants a review rather than waiting for the agent to checkpoint.

### 4. Completeness enforcement
The skill requires the agent to account for **every changed file**: either place it in a flow, or leave it unclaimed *deliberately* (the tool's **Leftovers** bucket surfaces anything unclaimed as a backstop). Before running the CLI, the agent confirms each changed file is intentionally grouped or intentionally a leftover. This closes the gap the Plan 3 review flagged (leftover changes could otherwise ride along unreviewed).

## Error handling
- **Malformed / invalid `handoff.json`** → the CLI validates (Plan 1 `parseHandoff`) and refuses to open; the skill instructs the agent to read the error, fix the handoff, and retry.
- **Abort** → the human hits "Abort review"; the CLI exits non-zero with "review was not submitted"; the skill instructs the agent to stop and ask the human how to proceed (do not assume approval).
- **No changes** (empty `git diff`) → the skill tells the agent there is nothing to review; it does not open the tool.

## Testing
- **Packaging path-logic** (the CLI spawns `next start` with cwd = package dir; `feedbackOut` resolves to the invoking cwd) → unit-tested with pure helpers.
- **Bundle smoke** → `npm pack` (or a build check) confirms `.next` + required files are shipped.
- The **skill and slash command are prompt content** — not unit-testable; verified by one manual end-to-end run (agent writes a handoff → CLI opens → human submits → agent reads feedback).
- **Carry-forward folded in here** (from the Plan 3 final review): a **contract round-trip test** (write handoff → POST `/api/feedback` → `parseFeedback` asserts), and a **zero-flow guard** in the page.

## Non-goals (v1)
- Publishing to a public npm registry (the global bin works from a local `npm i -g .` / `npm link`; registry publish is later).
- Auto-detecting checkpoints for the agent (the agent uses judgment / the human uses the command).
- Multi-repo, manual re-grouping, branch-vs-base (still "later" per the master spec).

## Success criteria
- From a coding-agent session, a single skill invocation produces a flow-grouped review in the browser, blocks, and returns actionable feedback the agent applies — with no changed file escaping review.
- `flowreview` runs against an arbitrary project after a global install, serving from its own location and writing `feedback.json` into the reviewed project.
