# FlowReview

**Review AI-generated code by the flow of data, not file-by-file.**

When a coding agent produces a whole feature at once, FlowReview shows it to you as
**vertical slices** — for each flow (e.g. one endpoint or use case) it lays out the
complete path the data travels, in order (migration → model → endpoint → client → UI),
so you review one coherent idea end-to-end instead of jumping between files. You comment
on exact lines, sign off each slice, and your feedback goes straight back to the agent.

---

## 1. Requirements

- **Node.js ≥ 20** (Next.js 15 / Vitest 3). Check with `node --version`.
  If you use `nvm`: `nvm install 24 && nvm use 24`.
- **git** (FlowReview reviews a project's `git diff`).

---

## 2. Install

From the FlowReview repo (the branch that contains all four build stages —
`plan-04-claude-integration`, or `master` once the stack is merged):

```bash
npm install          # install dependencies
npm run build        # build the review UI (required before first use)
npm link             # put the `flowreview` command on your PATH  (reversible)
```

`npm link` is recommended for trying it out (undo with `npm unlink -g flowreview`).
For a permanent install use `npm i -g .` instead.

Verify it's installed:

```bash
flowreview            # prints: usage: flowreview <handoff.json>
```

---

## 3. Try it in 2 minutes (standalone)

You don't need an agent to see FlowReview work — hand-write one `handoff.json` and run it.

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
flowreview handoff.json
```

Your browser opens to the focus-mode review. It **blocks here** until you submit.

**d. Review it:** you'll see the "Example flow" slice with `example.txt` and its added
lines highlighted. Click a line to leave a comment (🔴 must-fix / ❓ question / 💡 nit),
give the flow a verdict (**Approve** or **Request changes**), then **Send to agent**.
(Or **Abort review** to release without feedback.)

**e. See the result:** `flowreview` exits and writes **`feedback.json`** into the
directory you ran it from:

```bash
cat /tmp/fr-demo/feedback.json    # your verdicts + line comments, ready for an agent
```

That's the whole loop. Clean up with `rm -rf /tmp/fr-demo`.

---

## 4. Use it with a coding agent (Claude Code)

FlowReview ships a Claude Code integration in `integrations/claude-code/`:

- **`flow-review` skill** — the agent invokes it at a checkpoint after writing a feature:
  it stages its changes, groups them into data-flow slices, writes `handoff.json`, runs
  `flowreview handoff.json` (which **blocks the agent** until you submit), then reads
  `feedback.json` and acts on each comment (by intent) and each flow's verdict.
- **`/flow-review` command** — run it yourself to demand a review of the agent's current
  changes on the spot.

Install them by copying the skill and command into your Claude Code config (e.g. a
plugin or your `~/.claude/` skills/commands directory), with `flowreview` on your PATH
(step 2). Then, in a session where the agent has made changes, the agent runs the skill
(or you run `/flow-review`) and the same browser loop opens.

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

FlowReview's only interface is two JSON files, so any agent can drive it:

- **`handoff.json`** (in): `{ version:1, root, base:"working-tree", feature?, flows[] }`,
  where each flow has `id`, `title`, optional `complete`, and `steps[]` of
  `{ path, ranges:[[start,end],…], role, note? }`.
- **`feedback.json`** (out): `{ version:1, submittedAt, flows:[{id, verdict}],
  comments:[{flowId, path, lines:[start,end], intent, text}] }`.
  `intent` ∈ `must-fix | question | nit`; `verdict` ∈ `approved | changes-requested`.

Full design: `docs/superpowers/specs/`.

---

## 7. Troubleshooting

- **`flowreview: command not found`** — run `npm link` (step 2) and ensure your npm global
  bin is on `PATH`.
- **A new file you added isn't in the review** — FlowReview reviews `git diff HEAD`, which
  ignores untracked files. Run `git add -A` first (the agent skill does this automatically).
- **"server did not start in time" / blank page** — run `npm run build` in the FlowReview
  repo; the CLI serves a production build.
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

Uninstall the linked CLI: `npm unlink -g flowreview`.
