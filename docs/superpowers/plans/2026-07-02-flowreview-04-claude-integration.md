# FlowReview — Plan 4: Claude Code integration + global packaging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FlowReview usable from inside a coding-agent session: a globally-installable `flowreview` CLI plus a Claude Code skill (agent-invoked) and slash command (human-invoked) that group changes into flows, open the blocking review, and act on the returned feedback.

**Architecture:** Package the existing Next.js app + CLI so `flowreview` runs against ANY project after a global/link install — the app serves from its own install location while targeting the reviewed project via `handoff.root` (git diff + file reads) and the invoking cwd (`feedback.json` output). Add a `flow-review` Claude Code skill + `/flow-review` command that guide the agent through the loop, enforcing that every changed file is accounted for. Fold in two Plan-3 carry-forward items (a contract round-trip test and a zero-flow page guard).

**Tech Stack:** Node.js ≥ 20, TypeScript (strict), Next.js 15, Vitest, `tsx` (runtime, for the CLI), Claude Code skill/command markdown.

## Global Constraints

- **Node.js ≥ 20** — prefix every `node`/`npm`/`npx` command with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` (fresh shells default to an older Node).
- **`src/core` stays untouched and pure.**
- **Vitest has no path-alias resolution** — Vitest-loaded files use RELATIVE imports only (no `@/`).
- **The two-file JSON contract is unchanged**: `handoff.json` in (validated by `parseHandoff`), `feedback.json` out.
- **The reviewed project is identified by `handoff.root`** (git diff + file reads) and the **invoking cwd** (`feedback.json` output); the app itself serves from its own install directory.
- **TypeScript strict mode on.** Commit messages contain **no AI attribution**.
- **v1 packaging target:** works via `npm i -g .` / `npm link` (public-registry publish is a non-goal).
- **Do NOT run `flowreview` / `npm run review` in an automated agent** — it boots a server, opens a browser, and blocks for up to an hour. Only the human end-to-end smoke runs it.

---

### Task 1: CLI serves from its own package dir

**Files:**
- Create: `src/server/paths.ts`
- Test: `src/server/paths.test.ts`
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `packageRootFrom(cliModuleUrl: string): string` — given `src/cli.ts`'s `import.meta.url`, returns the package root (two directories up). `src/cli.ts` uses it to spawn `next start` with `cwd` = the package root.

- [ ] **Step 1: Write the failing test `src/server/paths.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { packageRootFrom } from "./paths";

describe("packageRootFrom", () => {
  it("resolves the package root two levels above src/cli.ts", () => {
    expect(packageRootFrom("file:///Users/x/flowreview/src/cli.ts")).toBe("/Users/x/flowreview");
  });

  it("works for a nested install path", () => {
    expect(packageRootFrom("file:///opt/tools/fr/src/cli.ts")).toBe("/opt/tools/fr");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- paths`
Expected: FAIL — `Cannot find module './paths'`.

- [ ] **Step 3: Create `src/server/paths.ts`**

```typescript
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/**
 * The package root, given `src/cli.ts`'s `import.meta.url`. `cli.ts` lives at
 * `<packageRoot>/src/cli.ts`, so the root is two directories up. Used so the CLI
 * can spawn `next start` from the package's own directory (where `.next` lives)
 * even when invoked from an arbitrary project's working directory.
 */
export function packageRootFrom(cliModuleUrl: string): string {
  return dirname(dirname(fileURLToPath(cliModuleUrl)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- paths`
Expected: PASS — both cases green.

- [ ] **Step 5: Update `src/cli.ts` to spawn from the package root**

Add the import near the other imports:
```typescript
import { packageRootFrom } from "./server/paths";
```

Find the server spawn:
```typescript
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    stdio: "inherit",
    env: {
      ...process.env,
      FLOWREVIEW_HANDOFF: handoffPath,
      FLOWREVIEW_FEEDBACK_OUT: feedbackOut,
      FLOWREVIEW_DONE: donePath,
    },
  });
```

Replace it with (adds `cwd` = the package root, so `next start` finds this package's build regardless of the invoking directory):
```typescript
  const packageRoot = packageRootFrom(import.meta.url);
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: packageRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      FLOWREVIEW_HANDOFF: handoffPath,
      FLOWREVIEW_FEEDBACK_OUT: feedbackOut,
      FLOWREVIEW_DONE: donePath,
    },
  });
```

Do not change `handoffPath` (`resolve(handoffArg)` — invoking-cwd-relative) or `feedbackOut` (`join(process.cwd(), "feedback.json")` — invoking cwd). Those correctly target the reviewed project.

- [ ] **Step 6: Verify typecheck + full suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm run typecheck && npm test`
Expected: `tsc --noEmit` exits 0; full suite passes (paths test included). (Do NOT run the CLI — it blocks.)

- [ ] **Step 7: Commit**

```bash
git add src/server/paths.ts src/server/paths.test.ts src/cli.ts
git commit -m "feat(cli): spawn the review server from the package dir so it runs against any project"
```

---

### Task 2: Package for global install

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `bin/flowreview.mjs` (from Plan 2) and the `src/cli.ts` change from Task 1.
- Produces: a `package.json` whose `npm pack` bundle contains the built app + the CLI sources, and whose runtime deps include `tsx` (the bin runs the TS CLI via `tsx`).

- [ ] **Step 1: Move `tsx` to `dependencies` and add packaging fields in `package.json`**

- Move `"tsx"` from `devDependencies` into `dependencies` (a global install runs the bin via `tsx`, and global installs do not install devDependencies).
- Add a top-level `files` allowlist:
```json
  "files": [
    ".next",
    "app",
    "src",
    "bin",
    ".flowbite-react",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json"
  ],
```
- Add a `prepack` script that builds the app before packing/publishing (so `.next` is present in the tarball). Update the `scripts` block to include:
```json
    "prepack": "next build",
```
- Confirm the existing `bin` field is present:
```json
  "bin": { "flowreview": "bin/flowreview.mjs" },
```

- [ ] **Step 2: Build, then inspect the pack contents**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npm run build
npm pack --dry-run 2>&1 | grep -E '\.next/|src/cli|bin/flowreview|src/core/index|src/server/context' | head
```
Expected: the listing includes `.next/…` entries, `bin/flowreview.mjs`, `src/cli.ts`, `src/core/index.ts`, and `src/server/context.ts` — proving the app build and the CLI sources ship. (`.gitignore` does not affect `npm pack`; the `files` allowlist governs it.)

- [ ] **Step 3: Verify the CLI's `--help`/usage path without booting the server**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
node bin/flowreview.mjs 2>&1 | head -3
```
Expected: prints `usage: flowreview <handoff.json>` and exits (no argument → usage, exit 2). This confirms the bin → `tsx src/cli.ts` path resolves and runs. Do NOT pass a handoff (that would boot the blocking server).

- [ ] **Step 4: Verify the full suite + typecheck still pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(app): package flowreview for global install (files allowlist, prepack build, tsx runtime)"
```

---

### Task 3: The `flow-review` skill + `/flow-review` command

**Files:**
- Create: `integrations/claude-code/skills/flow-review/SKILL.md`
- Create: `integrations/claude-code/commands/flow-review.md`

**Interfaces:**
- Consumes: the `flowreview` CLI (Tasks 1–2) and the Plan-1 handoff/feedback contract.
- Produces: agent-facing prompt content (no code). Verified by review against the spec's §2/§3/§4, not by unit tests.

- [ ] **Step 1: Create `integrations/claude-code/skills/flow-review/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Create `integrations/claude-code/commands/flow-review.md`**

```markdown
---
description: Review my current uncommitted changes by data-flow slices, then act on my feedback.
---

Follow the flow-review skill now for the current uncommitted changes:

1. Run `git diff --no-color` to see every change.
2. Group all changed files into flows (in data-flow order) — nothing left unaccounted for; anything not in a flow is a deliberate leftover.
3. Write `handoff.json` in the repo root (contract: `{ version:1, root, base:"working-tree", feature?, flows[] }`).
4. Run `flowreview handoff.json` — this blocks until I submit in the browser.
5. Read `feedback.json` and act on every comment by its intent and each flow's verdict. If I abort, stop and ask me.
```

- [ ] **Step 3: Verify the files render and contain the loop**

Run:
```bash
grep -c "flowreview handoff.json" integrations/claude-code/skills/flow-review/SKILL.md integrations/claude-code/commands/flow-review.md
```
Expected: each file reports `1` (both invoke the blocking CLI). Confirm by eye that the SKILL.md frontmatter has `name`/`description` and the 7 steps are present.

- [ ] **Step 4: Commit**

```bash
git add integrations/claude-code
git commit -m "feat(integration): add flow-review Claude Code skill and slash command"
```

---

### Task 4: Carry-forward — contract round-trip test + zero-flow guard

**Files:**
- Create: `src/server/contract-roundtrip.test.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `POST` from `app/api/feedback/route.ts`; `parseFeedback` from `src/core/index`; the page's existing model state.
- Produces: an end-to-end contract assertion, and a page guard for a zero-flow model.

- [ ] **Step 1: Write the failing test `src/server/contract-roundtrip.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "../../app/api/feedback/route";
import { parseFeedback } from "../core/index";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "flowreview-contract-"));
  process.env.FLOWREVIEW_HANDOFF = join(dir, "handoff.json");
  process.env.FLOWREVIEW_FEEDBACK_OUT = join(dir, "feedback.json");
  process.env.FLOWREVIEW_DONE = join(dir, ".done");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.FLOWREVIEW_HANDOFF;
  delete process.env.FLOWREVIEW_FEEDBACK_OUT;
  delete process.env.FLOWREVIEW_DONE;
});

describe("feedback contract round-trip through the route", () => {
  it("writes a feedback.json that parseFeedback accepts with the same content", async () => {
    const payload = {
      version: 1,
      submittedAt: "2026-07-02T00:00:00.000Z",
      flows: [{ id: "create-booking", verdict: "changes-requested" }],
      comments: [
        { flowId: "create-booking", path: "app/models/booking.rb", lines: [14, 14], intent: "must-fix", text: "guard nil" },
      ],
    };
    const res = await POST(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(payload) }));
    expect(res.status).toBe(200);

    const written = parseFeedback(readFileSync(process.env.FLOWREVIEW_FEEDBACK_OUT as string, "utf8"));
    expect(written.flows).toEqual([{ id: "create-booking", verdict: "changes-requested" }]);
    expect(written.comments[0].intent).toBe("must-fix");
    expect(written.comments[0].lines).toEqual([14, 14]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- contract-roundtrip`
Expected: FAIL — cannot find `../../app/api/feedback/route`? No — that route exists (Plan 2). The test SHOULD pass immediately since it exercises existing code. That is acceptable: this task's red step is a no-op for the test (the new behavior is the page guard in Step 4). If it passes, proceed; if it fails, read the failure and fix the discrepancy it reveals before continuing.

- [ ] **Step 3: Confirm the round-trip test passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- contract-roundtrip`
Expected: PASS — the written `feedback.json` parses back with the same verdict + comment intent/lines.

- [ ] **Step 4: Add a zero-flow guard to `app/page.tsx`**

Find:
```tsx
  if (status === "aborted") return <main className="p-8">Review aborted. You can close this tab.</main>;

  const flow = model.flows[current];
```

Replace with (guards a model with no flows before indexing):
```tsx
  if (status === "aborted") return <main className="p-8">Review aborted. You can close this tab.</main>;
  if (model.flows.length === 0) return <main className="p-8">No flows to review.</main>;

  const flow = model.flows[current];
```

- [ ] **Step 5: Verify typecheck + build + full suite**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm run typecheck && npm run build && npm test`
Expected: typecheck 0; build succeeds; full suite passes (contract-roundtrip included).

- [ ] **Step 6: Commit**

```bash
git add src/server/contract-roundtrip.test.ts app/page.tsx
git commit -m "test(app): assert the feedback contract round-trip; guard the zero-flow page"
```

---

### Task 5: Install & usage docs + end-to-end smoke

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: install + in-session usage documentation.

- [ ] **Step 1: Add an "Install & use with a coding agent" section to `README.md`**

Append this section:

````markdown
## Install as a global tool

```bash
npm run build      # build the app once
npm i -g .         # (or: npm link) — installs the `flowreview` bin globally
```

Now `flowreview <handoff.json>` works from any project: it serves the review UI
from its own install location, reads that project's `git diff` via the handoff's
`root`, and writes `feedback.json` into your current directory.

## Use it from a coding agent (Claude Code)

Install the integration files (`integrations/claude-code/`):
- the **`flow-review` skill** — your agent invokes it at a checkpoint: it groups
  its uncommitted changes into data-flow slices, writes `handoff.json`, runs
  `flowreview handoff.json` (which blocks until you submit), then reads
  `feedback.json` and acts on your comments and per-flow verdicts.
- the **`/flow-review` command** — run it yourself to demand a review of the
  agent's current changes on the spot.

Every changed file is accounted for — grouped into a flow or surfaced in the
**Leftovers** bucket — so nothing escapes review.
````

- [ ] **Step 2: Verify the README renders**

Run: `grep -c "flowreview" README.md`
Expected: ≥ 3 (install + usage references present).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document global install and the Claude Code flow-review integration"
```

- [ ] **Step 4: Manual end-to-end smoke (human step — do NOT run in an automated agent)**

In a real project with uncommitted changes:
```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
# from the flowreview repo: npm run build && npm i -g .   (once)
# then, in the target project, have the agent (or you) write handoff.json and run:
flowreview handoff.json
```
Expected: the focus-mode review opens in the browser, targeting the project's changes; on submit, `feedback.json` appears in the project dir and the CLI exits 0; on Abort, it exits non-zero ("not submitted"). Record the result in the task report (manual — it opens a browser and cannot be asserted in CI).

---

## Self-Review

**1. Spec coverage (integration design):**
- §1 Global CLI packaging → Task 1 (serve-from-package-dir) + Task 2 (files/prepack/tsx). ✓
- §2 `flow-review` skill (agent loop) → Task 3 (SKILL.md). ✓
- §3 `/flow-review` command → Task 3 (command.md). ✓
- §4 Completeness (account for every changed file) → Task 3 (skill Step 3 + command Step 2). ✓
- Error handling (bad handoff / abort / no changes) → Task 3 (skill Steps 5–6 + Requirements). ✓
- Testing (packaging path-logic unit test; bundle smoke; round-trip test; zero-flow guard; manual e2e) → Tasks 1, 2, 4, 5. ✓
- Carry-forward (contract round-trip + zero-flow guard) → Task 4. ✓

**2. Placeholder scan:** No TBD/TODO. Task 4 Step 2 notes its red step may be a no-op (the route exists) — explained, not a placeholder. Task 5 Step 4 is explicitly a manual human step.

**3. Type consistency:** `packageRootFrom(cliModuleUrl: string): string` defined in Task 1 and called with `import.meta.url` in the same task's cli.ts edit. The handoff/feedback shapes in the skill (Task 3) match Plan 1's contract (`version:1`, `root`, `base:"working-tree"`, `flows[].steps[].{path,ranges,role,note?}`; feedback `flows[].{id,verdict}`, `comments[].{flowId,path,lines,intent,text}`). The round-trip test (Task 4) uses `parseFeedback` and the `/api/feedback` `POST` with those exact shapes. Env var names (`FLOWREVIEW_HANDOFF`/`FEEDBACK_OUT`/`DONE`) match the server layer.

## Notes for execution
- Tasks 1, 2, 4 are unit/build-verified; Task 3 (skill/command) is prompt content verified by review; Task 5 is docs + a manual e2e smoke. Only the human smoke runs the blocking CLI.
- The packaging (Task 2) is validated by `npm pack --dry-run` (bundle contents) + the bin usage check (Task 2 Step 3) + the manual e2e (Task 5). A registry publish is out of scope.
