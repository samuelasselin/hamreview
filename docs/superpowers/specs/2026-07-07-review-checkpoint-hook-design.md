# HamReview — Review Checkpoint Hook Design Spec

- **Date:** 2026-07-07
- **Status:** Draft — pending user review
- **Depends on:** the shipped `ham-review` plugin (skill + command) on `main`.
- **Goal:** make the review **reliably trigger at genuine feature/flow-complete checkpoints**, without depending on the agent remembering to invoke the skill.

## Purpose

A Claude Code skill only fires when the **model** judges its `description` relevant. During active implementation the agent has momentum, and a soft "review at a checkpoint" description loses to "keep coding" — so in practice **the agent never invokes `ham-review` on its own**. Nothing fires it on an event.

The fix is a mechanism that does **not** depend on the agent thinking of it: a deterministic `Stop` hook. But the *judgment* of "is this a complete, reviewable feature?" is semantic and must stay intelligent — a dumb file-count threshold would misfire. So the hook fires deterministically and **delegates the judgment to the agent**, which has full session context.

## Decisions

### 1. Ship a `Stop` hook that forces the agent's judgment

The plugin ships a `Stop` hook (`hooks/hooks.json`, `matcher: "*"`, command = `${CLAUDE_PLUGIN_ROOT}/scripts/checkpoint.mjs`). On every turn-end the hook receives stdin JSON including `cwd`, and:

1. Inspects the repo at `cwd` with `git`.
2. If there is an **un-reviewed** working-tree change (see §2), it emits a **block** decision whose `reason` is injected into the agent's context, forcing the agent to judge completeness and act.
3. Otherwise it allows the stop (exits 0, no output).

**The injected `reason` (the heart of the mechanism):**

```
⚠ ham-review checkpoint — you're ending your turn with uncommitted, un-reviewed changes:
  <git status --porcelain summary, e.g. "M app/page.tsx, A app/lib/x.ts (+2 more)">

Before you stop, decide whether these form a COMPLETE, reviewable unit — a coherent
feature or data-flow (e.g. an endpoint / use-case / component with its supporting
layers), not a half-written change, a trivial tweak, or pure config/docs.
  • If YES → invoke the ham-review skill now.
  • If NO  → say in one line why it's not review-ready yet, then stop.

You will not be asked again about this exact set of changes.
```

- **Deterministic firing** (hook on `Stop`) solves "the agent never thinks of it" — the agent is *forced to consider* review at every checkpoint.
- **Intelligent judgment** stays with the agent — it decides "complete feature or not," not a heuristic. This is what makes it fire at *genuine* moments.
- The hook stays intentionally **permissive** about *what* counts as work; relevance/completeness filtering (docs-only, trivial, half-written) is the agent's job, guided by the prompt.

`additionalContext` carries a one-line note that this checkpoint is injected by the hamreview plugin and fires once per distinct working-tree state.

### 2. Anti-nag via a staging-invariant work signature

To avoid asking twice about the same changes (and to avoid infinite stop-loops, since `stop_hook_active` is **not** documented in the current hook contract and is not relied upon):

- The hook computes a **work signature**: a hash over the set of changed paths (from `git status --porcelain`, covering staged, unstaged, and untracked) plus each path's current **working-tree content** (or a deletion marker for removed files). This is **staging-invariant** — `ham-review`'s own `git add -A` (step 1 of the skill) must not change the signature — and content-sensitive (new edits change it).
- State is stored **inside the repo's git dir** at `$(git rev-parse --git-dir)/hamreview-state.json` (`{ "lastAskedSignature": "…" }`). Using `.git/` keeps the working tree clean and needs no `.gitignore` entry; it is per-repo and disappears with the repo.
- Decision: if the current signature is empty (clean) or equals `lastAskedSignature` → **allow stop**. Otherwise → **block** with the prompt, then write the current signature to `lastAskedSignature`.
- Consequence: each distinct working-tree state is asked about **at most once**. If the agent judges "not complete" and stops, it is not nagged again until it writes new code (a new signature). If it runs the review, the loop is closed by that action.

### 3. Sharpen the `SKILL.md` description

Rewrite the trigger to concrete, symptom-based conditions so that both the agent's own discovery and the hook's prompt point at the same moment. Keep it **"when to use," not a workflow summary** (per superpowers:writing-skills SDO — a workflow summary in the description causes agents to follow the description instead of reading the skill body).

Proposed:
> `Use right after implementing a coherent feature or data-flow — a new or changed endpoint, use-case, component, or migration and its supporting layers — before committing or starting the next task; or whenever the human asks. Review the change WITH the human, grouped by the flow of data.`

### 4. Scope: default-on, no opt-out (v1)

Installing the plugin **is** the consent. The hook is active in every repo the plugin sees — no per-project marker, no config toggle. Rationale: the self-guard (§2) keeps it silent whenever the working tree is clean or its state was already asked about, so "on everywhere" is not "nagging everywhere."

**Isolation note (Karibew):** default-on means the hook runs in client repos too, but it only runs **local `git`** and **injects a prompt to the agent** — **nothing leaves the machine**, no client data is transmitted. The only cost of firing in a client repo is being asked whether to review; opt-out is a deliberate v1 non-goal (see below).

## Architecture / isolation

- **Pure decision core** (testable, no I/O): `signature(changes) → hash` and `decide(signature, lastAsked) → {block, reason} | {allow}`. Kept free of process/git/FS side effects so it unit-tests like the rest of `src/core`.
- **Thin shell wrapper** (`scripts/checkpoint.mjs`): reads stdin, shells `git` against `cwd`, reads/writes the state file, calls the pure core, prints the JSON decision. All I/O and error handling live here.

## Error handling — fail open, always

The hook must **never trap the user**. On any of these, it exits 0 and allows the stop:

- `cwd` is not a git repo, or `git` is not installed.
- The working tree is clean (no changes).
- The state file is **unreadable, corrupt, or unwritable** — critically, if the hook cannot persist `lastAskedSignature`, it must **allow** the stop (blocking without being able to record the ask would create an unbreakable loop).
- Any unexpected error / exception in the script.

The `reason` is kept short to avoid bloating the agent's context.

## Testing

- **Signature (pure):** staging-invariant (identical before/after `git add -A`), changes on content edit, empty on clean tree.
- **Decision (pure):** clean → allow; new signature → block + records ask; repeated signature → allow; not-a-repo/git-missing → allow; unwritable state → allow (fail-open).
- **Wrapper:** emits `{"decision":"block","reason":…}` with exit 0 on a dirty new state; emits nothing / `{}` on clean; never exits non-zero on internal error.
- **Manual e2e (human):** install the plugin; make a feature-shaped change, end a turn → agent is prompted and runs `ham-review`; repeat the turn with no new edits → no re-prompt; make a trivial/docs-only change → agent is prompted but legitimately declines; clean repo → silent.

## Non-goals (v1)

- **Opt-out / config toggle** or per-project marker (default-on, no escape hatch — for now).
- **LLM-in-the-hook** (the hook judging the diff itself) — judgment is delegated to the agent.
- **Commit-gate hook** (blocking `git commit` until reviewed) — a possible later backstop.
- **Auto-running the review** without the agent's completeness judgment.
- **Fixing the auto-mode / `npx` permission block** — see Risks; tracked separately.

## Risks / dependencies

- **Execution block (adjacent, not solved here):** even when triggered, the observed workflow had `npx -y hamreview` **denied by the auto-mode classifier**. Triggering reliably is pointless if the review can't then open. This spec closes the *trigger* gap; the *execution* gap (a permission allowlist entry, or invoking the CLI by a path auto-mode trusts) must be handled so the loop actually closes. Flagged for the implementation plan / a follow-up.
- **Cadence:** the hook fires at every turn-end where the working-tree state has advanced. Because it fires on `Stop` (not per edit) and asks at most once per state, cadence should be roughly once per meaningful turn — acceptable, revisit if noisy.
- **Permissive by design:** the hook prompts on *any* non-empty new state; triviality is filtered by the **agent**, not the hook (consistent with keeping the hook dumb and the judgment intelligent). A minimal size floor (e.g. ignore < N changed lines) could cut prompts on tiny edits — deferred to keep v1 simple.

## Success criteria

- In a repo with a completed feature diff, **ending a turn reliably prompts the agent to judge and run `ham-review`** — without the agent having thought of it first.
- Clean and already-seen states stay silent; any working-tree state is asked about **at most once** (trivial/incomplete states → the agent declines and stops); no infinite loops.
- The hook **fails open** on every error path (missing git, non-repo, unwritable state, exceptions).
- Ships and runs as a plugin `Stop` hook (`hooks/hooks.json`) with no per-project setup.