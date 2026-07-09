# HamReview — Commit-Gate Hook Design Spec

- **Date:** 2026-07-08
- **Status:** Implemented
- **Depends on:** the review-checkpoint Stop hook (spec 2026-07-07), whose "commit-gate
  hook" non-goal this lifts.
- **Goal:** trigger the review at the **true** right moment — just before `git commit` —
  which the Stop checkpoint structurally misses.

## Why the Stop checkpoint was not enough (observed 2026-07-08)

A full day of real usage produced exactly two checkpoint firings, both correctly
declined (docs-only residue). Root causes:

1. The Stop hook only sees **uncommitted** changes at turn-end. Plan-execution
   workflows commit each task *within* the turn, so the reviewable unit is already
   committed — invisible to the checkpoint — and only docs/plan residue remains.
2. Mid-turn, competing review mechanisms (generic review subagents) capture the
   moment before the checkpoint can.

The commit itself is the perfect signal: the agent commits precisely when *it* judges
the unit coherent and complete. Gate that action instead of the turn boundary.

## Decisions

### 1. A `PreToolUse` hook on Bash `git commit` — soft, no threshold

`hooks/hooks.json` adds `PreToolUse` / `matcher: "Bash"` → `scripts/commit-gate.mjs`.
On every Bash call the hook:

1. Parses stdin (`tool_input.command`, `cwd`) and token-matches a `git commit`
   invocation (skipping git global options; honoring `-C <dir>` as the target repo).
   Anything else → allow, silently.
2. Computes the same staging-invariant work signature as the checkpoint
   (status entries minus `handoff.json`/`feedback.json` artifacts + content shas).
3. **Soft barrier:** if this signature was already gated once
   (`lastCommitGateSignature`), or the tree is clean/artifacts-only → allow.
   Otherwise record the signature, then **deny** with a reason instructing the agent
   to run the ham-review skill first — and telling it the retried commit will pass
   (escape hatch when the human already reviewed or explicitly waived review).
4. **No size threshold** (deliberate): triviality judgment stays with the agent,
   consistent with the checkpoint's philosophy. The once-per-signature guard bounds
   the cost of a false positive to a single deny.

Deny format: `hookSpecificOutput.permissionDecision = "deny"` with
`permissionDecisionReason` (PreToolUse-native; the reason is fed back to the agent).

### 2. Shared state, merged writes

Both hooks share `$(git rev-parse --git-dir)/hamreview-state.json`:
`{ lastAskedSignature }` (checkpoint) + `{ lastCommitGateSignature }` (gate).
Both hooks now **read-modify-write** the whole object — a write by one must never
erase the other's anti-nag memory (regression-tested).

### 3. Fail open, always (same contract as the checkpoint)

Unparseable stdin, non-Bash tool, no `cwd`, not a repo, git missing, status failure,
clean tree, unwritable state file, any exception → allow. A deny is only ever emitted
*after* the ask was successfully persisted (an unrecorded deny would block retries
forever).

## Interaction with the Stop checkpoint

- Feature built → commit attempted → **gate denies once** → agent opens ham-review →
  human submits → agent retries commit (same signature) → passes.
- Review requests changes → agent edits → new signature → the next commit is gated
  once more (correct: the new code is un-reviewed). The agent judges re-review vs
  immediate retry.
- Work left uncommitted at turn-end → the Stop checkpoint still fires (kept as the
  backstop for the never-committed path).

## Testing

- **Core (pure):** `matchGitCommit` (plain/chained/`-C`/`-c`/`--amend`/non-commit),
  `buildCommitGateReason` content.
- **Hook (integration):** first commit denied; retry allowed; new edits re-gated;
  non-commit and non-Bash ignored; clean tree, artifacts-only, non-repo allowed;
  corrupt state → deny (never-asked); unwritable state → allow; `-C` targets the
  named repo.
- **Cross-hook:** neither hook clobbers the other's state key.

## Non-goals

- Hard gate / configurable strictness (revisit if soft proves too easy to skip).
- Recording *reviewed* signatures from the CLI on submit (would let a post-review
  commit skip even its first ask when the review was opened spontaneously); deferred —
  needs an npm release and cross-version state compat.
- Gating commits made outside the agent (terminal, IDE) — out of reach of PreToolUse.
