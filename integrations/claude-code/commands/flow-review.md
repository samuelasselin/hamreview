---
description: Review my current uncommitted changes by data-flow slices, then act on my feedback.
---

Follow the flow-review skill now for the current uncommitted changes:

1. Run `git add -A` (so newly-created files are included — the review uses `git diff HEAD`, which ignores untracked files), then `git diff --no-color HEAD` to see every change.
2. Group all changed files into flows (in data-flow order) — nothing left unaccounted for; anything not in a flow is a deliberate leftover.
3. Write `handoff.json` in the repo root (contract: `{ version:1, root, base:"working-tree", feature?, flows[] }`).
4. Run `flowreview handoff.json` — this blocks until I submit in the browser.
5. Read `feedback.json` and act on every comment by its intent and each flow's verdict. If I abort, stop and ask me.
