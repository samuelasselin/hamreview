---
name: flow-review
description: Use at a checkpoint after writing a coherent slice of a feature (or when the human asks) to review it by data-flow slices — group your uncommitted changes into flows, open a blocking browser review for the human, and act on their line-level feedback before continuing.
---

# Flow Review

Review the code you just wrote WITH the human before building further on it, organized by the flow of data rather than file-by-file. You stay the code owner; the human signs off each slice.

## Steps

1. **See your changes.** Run `git diff --no-color` and `git status` in the project to see every uncommitted change.
2. **Group into flows.** For each distinct data path (typically one endpoint or use case), make a flow: an ordered list of steps in the order data moves through the system (e.g. migration → model → endpoint → client → UI — adapt to the actual stack). Grouping comes from understanding the code, not from language rules.
3. **Account for EVERY changed file.** Each changed file must be either placed in a flow OR left deliberately unclaimed (the tool surfaces unclaimed changes in a "Leftovers" bucket). Before opening the review, confirm every changed file is intentionally grouped or intentionally a leftover — never silently drop a change.
4. **Write `handoff.json`** in the repo root:
   ```json
   {
     "version": 1,
     "root": "<absolute path to the repo>",
     "base": "working-tree",
     "feature": "<short label>",
     "flows": [
       {
         "id": "create-booking",
         "title": "Create booking",
         "complete": true,
         "steps": [
           { "path": "app/models/booking.rb", "ranges": [[3, 3]], "role": "model", "note": "adds validation" },
           { "path": "app/controllers/bookings_controller.rb", "ranges": [[9, 24]], "role": "endpoint" }
         ]
       }
     ]
   }
   ```
   `ranges` are 1-indexed inclusive `[start, end]` line ranges in the NEW file. Set `"complete": false` for a flow that is only partially built so far.
5. **Open the review (this blocks your turn):** run `flowreview handoff.json`. Your turn blocks until the human submits in their browser; then `feedback.json` is written next to `handoff.json`.
6. **Act on the feedback.** Read `feedback.json`:
   - Per flow `verdict`: `changes-requested` → address its comments before proceeding; `approved` → the human owns this slice.
   - Per comment `intent`: `must-fix` → make the change; `question` → answer it (and change if warranted); `nit` → optional.
   - If the CLI exits with "review was not submitted" (the human aborted), STOP and ask the human how to proceed — do NOT assume approval.
7. **Re-checkpoint** if your follow-up changes warrant another review.

## Requirements
- `flowreview` must be installed and on PATH (`npm i -g .` or `npm link` the flowreview package).
- If `git diff` is empty, there is nothing to review — say so and do not open the tool.
