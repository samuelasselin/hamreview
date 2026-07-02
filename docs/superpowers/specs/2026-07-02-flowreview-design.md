# FlowReview — Design Spec

- **Date:** 2026-07-02
- **Status:** Approved for planning
- **Working name:** FlowReview (placeholder; may be renamed)

## Purpose & guiding principle

FlowReview is a local review surface that lets a developer **stay the owner of AI-generated code**. When a coding agent produces a feature that touches many layers at once, the developer must understand it — not skim it — before trusting it.

The core idea: review code as **vertical slices of data flow**, not file-by-file diffs. For each distinct flow (typically one endpoint or use case), show the complete path the data travels, in the order it moves through the system — e.g. migration → model → endpoint → client → UI — as one coherent slice reviewed end to end.

**Guiding principle:** review is not approval, it is *understanding well enough to defend the code*. The reviewer stays the author of record for code they did not type.

The grouping into flows comes from *understanding the code*, so the tool is **stack-agnostic** — no rules tied to any language or framework.

## Non-goals

- **Not** a generic file-by-file diff viewer — that already exists; the flow view is the only reason to build this.
- **Not** an automated reviewer — the tool does not review *for* the human; it gives a better surface to review *themselves*.
- **Not** a PR/hosted-review tool in v1 — the loop is local, in-session, and pre-commit.

## Core concepts

- **Flow** — an ordered list of **steps** representing one path data travels (one endpoint / use case). Ordering is data-flow order, declared by the agent.
- **Step** — a pointer `{ path, ranges, role, note? }` into changed code. Because a step is a **line-range, not a whole file**, one file's hunks can appear in several flows, and (in later versions) one flow can span multiple roots.
- **Change set** — the full set of changes under review, established by `git diff` (v1: the working tree). Ground truth.
- **Leftovers** — changed hunks that git saw but no flow claimed. Surfaced in a dedicated bucket so nothing that changed is ever invisible to the reviewer.
- **Checkpoint** — a point at which the agent blocks and requests review. Agent-initiated (at a coherent slice boundary) or human-initiated. The agent does nothing further until the reviewer signs off or sends feedback.

## Two inputs, two jobs

The two sources answer different questions and are both required:

- **`git diff` — "what changed?"** The completeness / trust boundary. The agent cannot hide a change; every changed line must appear somewhere in the review.
- **Agent handoff — "how does it group into flows?"** The semantics git cannot provide (grouping + data-flow ordering), coming from the agent's fresh intent.

The tool **reconciles** them:
- Changed hunks not covered by any step → **Leftovers** bucket.
- Handoff steps referencing lines git does not show as changed → flagged **stale** (still rendered, with a warning).

## The review surface

- **Focus mode:** one flow fills the screen. A progress rail lists every flow plus the Leftovers bucket. The reviewer advances flow-by-flow; reading is linear by design (no accidental skimming).
- **Step display:** each step shows the change **highlighted inside its enclosing context** (the surrounding function/class), dimmed, and **expandable** for more. Read the change where it lives — enough to judge it without opening an editor.
- **Shared code:** a step's code shared by multiple flows appears in **every flow that touches it**. After the first pass it renders **collapsed and marked "already reviewed in \<flow\>"** — per-flow context without re-reading the same diff repeatedly.
- **Partial flows are first-class:** a mid-feature checkpoint may present an incomplete slice ("3 of 5 steps — frontend pending"). The view must not assume every slice is end-to-end complete.
- **Comments** are tied to **exact lines** and carry an **intent**:
  - 🔴 **must-fix** — the agent must change this
  - ❓ **question** — explain; may or may not lead to a change
  - 💡 **nit** — optional
- **Per-slice verdict:** each flow gets **Approve** or **Request changes**. The rail becomes a green "ownership ledger." When slices have verdicts, **Send** returns feedback and unblocks the agent.

## The loop / contract

The handshake that makes blocking checkpoints work is two files plus a git diff — no daemon, no API, which is why any agent can drive it.

1. Agent finishes a coherent slice → writes **`handoff.json`** (change set + proposed flows).
2. Agent invokes the tool → tool reconciles the handoff against `git diff`, computes Leftovers/stale, opens the browser, and **blocks**.
3. Reviewer reads each slice, leaves line comments with intent, sets per-slice verdicts, hits **Send**.
4. Tool writes **`feedback.json`** and exits.
5. Agent reads `feedback.json` and acts (fix must-fixes, answer questions), then continues or checkpoints again.

### `handoff.json` (agent → tool)

```json
{
  "version": 1,
  "root": "/abs/path/to/repo",
  "base": "working-tree",
  "feature": "Bookings",
  "flows": [
    {
      "id": "create-booking",
      "title": "Create booking",
      "steps": [
        { "path": "db/migrate/20260702_create_bookings.rb", "ranges": [[1, 12]], "role": "migration", "note": "adds bookings table" },
        { "path": "app/models/booking.rb", "ranges": [[3, 3]], "role": "model" },
        { "path": "app/controllers/bookings_controller.rb", "ranges": [[9, 24]], "role": "endpoint" },
        { "path": "web/src/api/bookings.ts", "ranges": [[10, 18]], "role": "client" },
        { "path": "web/src/BookingForm.tsx", "ranges": [[40, 96]], "role": "ui" }
      ]
    }
  ]
}
```

- `base`: `"working-tree"` in v1 (uncommitted changes); a git ref is allowed for branch-vs-base later.
- `role`: free-text, agent-supplied, stack-agnostic label for the step.
- `ranges`: inclusive `[start, end]` line pairs; the tool reconciles them against the diff.

### `feedback.json` (tool → agent)

```json
{
  "version": 1,
  "submittedAt": "<tool-stamped ISO timestamp>",
  "flows": [
    { "id": "create-booking", "verdict": "approved" }
  ],
  "comments": [
    {
      "flowId": "create-booking",
      "path": "app/models/booking.rb",
      "lines": [14, 14],
      "intent": "must-fix",
      "text": "end == start slips through; add a DB constraint too."
    }
  ]
}
```

- `verdict`: `"approved" | "changes-requested"` per flow.
- `intent`: `"must-fix" | "question" | "nit"` per comment.

## Architecture

An **agent-agnostic core** plus a **thin Claude Code integration**:

- **Core** — a local HTTP server that serves the static browser review UI, reads `handoff.json`, runs the git-diff reconciliation, blocks until the reviewer submits, and writes `feedback.json`. The JSON contract is the only interface, so any agent can target it.
- **Claude Code integration** — a small skill/command that wires the agent to the core (writes the handoff, invokes the tool, reads the feedback), Plannotator-style. First consumer, not a dependency of the core.

*Language/framework is intentionally deferred to the planning phase.*

## Error handling

- **Handoff references unchanged lines** → flag step as *stale*, render anyway, warn in the UI.
- **Malformed `handoff.json`** → validation error returned to the agent; nothing opens.
- **Browser closed without Send** → the agent stays blocked (it is a checkpoint); a manual "abort review" path exists to release it.
- **Port in use** → bind another port, print the URL.

## Testing strategy

Deterministic surfaces to cover:
- git-diff ↔ handoff **reconciliation**: Leftovers computation and stale detection.
- `feedback.json` **serialization** (verdicts + comments with line anchors and intents).
- Contract **round-trip** (write handoff → run → read feedback).
- **Rendering** logic: enclosing-context extraction, shared-code dedupe/collapse, partial-flow display.

The *grouping itself* is not the tool's responsibility to test — the agent produces it.

## v1 scope

**In:**
- Focus-mode review surface (rail, enclosing-context steps, shared-code dedupe, partial flows).
- Two-file contract (`handoff.json` / `feedback.json`).
- git reconciliation + Leftovers bucket + stale detection.
- Line comments with 3-way intent.
- Per-slice verdicts + Send.
- **Single repo**, **agent-produced grouping**.
- Claude Code integration.

**Deferred (later):**
- Multi-repo / multi-root union.
- Manual re-grouping in the UI (merge/split/reorder the agent's slices).
- Policy steering ("always checkpoint after backend before frontend").
- "Changed since your last comment" highlighting on re-review.
- PR-URL mode / branch-vs-base as the primary input.

## Success criteria

- A reviewer can take a multi-layer feature and review it as coherent end-to-end slices instead of scattered files.
- No changed line escapes review (Leftovers guarantees completeness).
- Feedback returns to the agent with unambiguous line + intent + verdict, and the agent acts on it without manual copying.
- The tool is stack-agnostic: it works on any language/framework because the grouping comes from the agent's understanding, not from rules.
