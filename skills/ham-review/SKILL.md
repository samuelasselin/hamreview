---
name: ham-review
description: Use right after implementing a coherent feature or data-flow — a new or changed endpoint, use-case, component, or migration and its supporting layers — before committing or starting the next task; or whenever the human asks. Reviews the change WITH the human, grouped by the flow of data.
---

# HamReview

Review the code you just wrote WITH the human before building further on it, organized by the flow of data rather than file-by-file. You stay the code owner; the human signs off each slice.

## Steps

1. **Stage and see your changes.** First run `git add -A` so newly-created files are included — the review uses `git diff HEAD`, which ignores untracked files, so an unstaged new file would silently escape review. Then run `git diff --no-color HEAD` (and `git status`) to see every change; this is exactly what the tool reviews.
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
5. **Open the review — in the BACKGROUND (it blocks until the human submits).** From the repo
   root, run `npx -y hamreview handoff.json` as a background task (your shell tool's
   background/async mode — a foreground call gets killed by command timeouts long before a
   real review finishes). The CLI prints the review URL: relay it to the human immediately
   ("Review open at <URL>") in case their browser did not open. Then wait for the process to
   exit; read `feedback.json` only after it exits with code 0.
6. **Act on the outcome.**

   | Outcome | What you do |
   |---------|-------------|
   | Exit 0, `feedback.json` present | Read it. Per flow `verdict`: `changes-requested` → address its comments before proceeding; `approved` → the human owns this slice. Per comment `intent`: `must-fix` → make the change; `question` → answer it (and change if warranted); `nit` → optional. Comments with `flowId: "leftovers"` refer to changed files outside every flow — treat them like any other comment. |
   | "review was not submitted" (aborted) | STOP and ask the human how to proceed. Do NOT assume approval. |
   | The command is denied/blocked by a permission gate | Ask the human to allowlist it or run it themselves: `npx -y hamreview handoff.json`. Do not retry blindly. |
   | `HandoffValidationError …` | Fix `handoff.json` per the message and retry ONCE. Still failing → show the human the error and STOP. |
   | "server did not start in time" or any other error | Report the exact stderr to the human and STOP. Never assume approval; never invent feedback. |
7. **Re-checkpoint** if your follow-up changes warrant another review.

## Requirements
- Node.js ≥ 20 must be installed (`node --version`). The CLI is fetched and run via `npx -y hamreview` — no manual install needed.
- If `git diff` is empty, there is nothing to review — say so and do not open the tool.
