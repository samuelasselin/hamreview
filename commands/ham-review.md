---
description: Review my current uncommitted changes by data-flow slices, then act on my feedback.
---

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
