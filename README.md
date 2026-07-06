# HamReview

**Review AI-generated code by the flow of data, not file-by-file.**

When a coding agent produces a whole feature at once, HamReview shows it to you as
**vertical slices** — for each flow (e.g. one endpoint or use case) it lays out the
complete path the data travels, in order (migration → model → endpoint → client → UI),
so you review one coherent idea end-to-end instead of jumping between files. You comment
on exact lines, sign off each slice, and your feedback goes straight back to the agent.

---

## 1. Requirements

- **Node.js ≥ 20** (Next.js 15 / Vitest 3). Check with `node --version`.
  If you use `nvm`: `nvm install 24 && nvm use 24`.
- **git** (HamReview reviews a project's `git diff`).

---

## 2. Install

**Most people don't install anything.** If you use the Claude Code plugin (section 3),
it runs HamReview for you automatically via `npx`.

If you want to run the command yourself, pick one:

```bash
# Option A — recommended, no install. Downloads and caches on first run:
npx hamreview <handoff.json>

# Option B — install once, then call it directly:
npm i -g hamreview
hamreview <handoff.json>
```

---

## 3. Use it with a coding agent (Claude Code)

Install the plugin from its marketplace — no clone, no manual CLI install:

```text
/plugin marketplace add samuelasselin/hamreview
/plugin install ham-review@hamreview
```

This gives you:

- **`ham-review` skill** — the agent invokes it at a checkpoint after writing a feature:
  it stages its changes, groups them into data-flow slices, writes `handoff.json`, runs
  `npx -y hamreview handoff.json` (which **blocks the agent** until you submit), then
  reads `feedback.json` and acts on each comment (by intent) and each flow's verdict.
- **`/ham-review` command** — run it yourself to demand a review of the agent's current
  changes on the spot.

In a session where the agent has made changes, the agent runs the skill (or you run
`/ham-review`) and the browser loop opens — `npx` fetches the CLI on first use and caches
it for next time.

Every changed file is accounted for — grouped into a flow, or surfaced in the
**⚠ Leftovers** bucket — so nothing escapes review.

---

## 4. What you see in the review

- **Focus mode** — one flow fills the screen; a **progress rail** lists every flow (with
  your verdict marks) plus the Leftovers bucket. Advance flow-by-flow.
- **Steps** show each change inside its enclosing function/class; shared code touched by
  an earlier flow is collapsed and marked *"already reviewed in …"*; a **stale** badge
  flags handoff lines git didn't actually change; a **partial** badge marks an
  in-progress slice.
- **Comments** attach to exact lines and carry an intent (must-fix / question / nit).
- **Per-slice verdict** (Approve / Request changes) — **Send** is enabled once every flow
  has a verdict.

---

## 5. The contract (for reference)

HamReview's only interface is two JSON files, so any agent can drive it:

- **`handoff.json`** (in): `{ version:1, root, base:"working-tree", feature?, flows[] }`,
  where each flow has `id`, `title`, optional `complete`, and `steps[]` of
  `{ path, ranges:[[start,end],…], role, note? }`.
- **`feedback.json`** (out): `{ version:1, submittedAt, flows:[{id, verdict}],
  comments:[{flowId, path, lines:[start,end], intent, text}] }`.
  `intent` ∈ `must-fix | question | nit`; `verdict` ∈ `approved | changes-requested`.

Full design: `docs/superpowers/specs/`.

---

## 6. Troubleshooting

- **`npx hamreview` fails to fetch / hangs** — check your network and npm registry
  access; try `npm i -g hamreview` instead so the command is installed locally.
- **`hamreview: command not found`** (global install) — ensure your npm global bin is on
  `PATH`, or just use `npx hamreview` instead.
- **A new file you added isn't in the review** — HamReview reviews `git diff HEAD`, which
  ignores untracked files. Run `git add -A` first (the agent skill does this automatically).
- **"server did not start in time" / blank page** — try again; if it persists, reinstall
  with `npm i -g hamreview` (or clear the `npx` cache with `npx clear-npx-cache`) and retry.
- **Wrong Node version errors** — you need Node ≥ 20 (`nvm use 24`).
- **Nothing happens / it seems stuck** — that's the point: the CLI **blocks** until you
  submit or abort in the browser tab it opened.

---

## 7. Develop

```bash
npm test               # unit + integration tests
npm run typecheck      # typecheck the app
npm run typecheck:core # verify the core stays framework/DOM-free
npm run build          # production build
```

Remove a global install: `npm rm -g hamreview`.