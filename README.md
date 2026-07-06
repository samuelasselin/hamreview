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

No clone needed — pick one:

```bash
# one-off / recommended — no install, downloads and caches:
npx hamreview <handoff.json>

# or install the command globally:
npm i -g hamreview
hamreview <handoff.json>
```

Verify it's installed (global install only):

```bash
hamreview            # prints: usage: hamreview <handoff.json>
```

---

## 3. Try it in 2 minutes (standalone)

You don't need an agent to see HamReview work — hand-write one `handoff.json` and run it.

**a. Make a throwaway project with a change to review:**

```bash
mkdir /tmp/fr-demo && cd /tmp/fr-demo
git init -q
printf 'hello\n' > example.txt
git add -A && git -c user.email=you@example.com -c user.name=you commit -qm "init"

# now make an uncommitted change (add two lines):
printf 'hello\nworld\nagain\n' > example.txt
git add -A     # IMPORTANT: stage changes so new/changed lines appear in `git diff HEAD`
```

**b. Write `handoff.json` in that project** (describes the flows to review):

```bash
cat > handoff.json <<JSON
{
  "version": 1,
  "root": "/tmp/fr-demo",
  "base": "working-tree",
  "feature": "Demo change",
  "flows": [
    {
      "id": "example",
      "title": "Example flow",
      "steps": [
        { "path": "example.txt", "ranges": [[2, 3]], "role": "content", "note": "added lines" }
      ]
    }
  ]
}
JSON
```

(`ranges` are 1-indexed inclusive `[start, end]` line ranges in the changed file.)

**c. Open the review:**

```bash
npx hamreview handoff.json
```

Your browser opens to the focus-mode review. It **blocks here** until you submit.

**d. Review it:** you'll see the "Example flow" slice with `example.txt` and its added
lines highlighted. Click a line to leave a comment (🔴 must-fix / ❓ question / 💡 nit),
give the flow a verdict (**Approve** or **Request changes**), then **Send to agent**.
(Or **Abort review** to release without feedback.)

**e. See the result:** `hamreview` exits and writes **`feedback.json`** into the
directory you ran it from:

```bash
cat /tmp/fr-demo/feedback.json    # your verdicts + line comments, ready for an agent
```

That's the whole loop. Clean up with `rm -rf /tmp/fr-demo`.

---

## 4. Use it with a coding agent (Claude Code)

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

## 5. What you see in the review

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

## 6. The contract (for reference)

HamReview's only interface is two JSON files, so any agent can drive it:

- **`handoff.json`** (in): `{ version:1, root, base:"working-tree", feature?, flows[] }`,
  where each flow has `id`, `title`, optional `complete`, and `steps[]` of
  `{ path, ranges:[[start,end],…], role, note? }`.
- **`feedback.json`** (out): `{ version:1, submittedAt, flows:[{id, verdict}],
  comments:[{flowId, path, lines:[start,end], intent, text}] }`.
  `intent` ∈ `must-fix | question | nit`; `verdict` ∈ `approved | changes-requested`.

Full design: `docs/superpowers/specs/`.

---

## 7. Troubleshooting

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

## 8. Develop

```bash
npm test               # unit + integration tests
npm run typecheck      # typecheck the app
npm run typecheck:core # verify the core stays framework/DOM-free
npm run build          # production build
```

Remove a global install: `npm rm -g hamreview`.
