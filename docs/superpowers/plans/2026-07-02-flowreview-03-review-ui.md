# FlowReview — Plan 3: The focus-mode review UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal round-trip page with the real focus-mode review surface — a progress rail, one flow at a time, enclosing-context steps with collapsed shared-code and stale/partial badges, line comments with intent, per-slice verdicts, Send, and an Abort control.

**Architecture:** The review *logic* lives in a pure, node-tested module (`app/lib/review-state.ts`) that accumulates per-flow verdicts + line comments and assembles the `feedback.json` payload via the core's `buildFeedback`. The React components (`app/components/*`) and `app/page.tsx` are presentational: they consume the full `ReviewModel` from `/api/review` (all fields — `stale`, `staleRanges`, `collapsed`, `alreadyReviewedIn`, `partial` — are already on the wire) and drive that pure state. A new `/api/abort` endpoint lets the reviewer release the blocked CLI without submitting. Components are verified by `typecheck` + `next build` + a manual browser smoke; their behavior-bearing logic is unit-tested where it is pure.

**Tech Stack:** Next.js 15 (App Router, client components), React 19, Tailwind CSS v4, Flowbite React (`Button`), TypeScript (strict), Vitest.

## Global Constraints

- **Node.js ≥ 20** — prefix every `node`/`npm`/`npx` command with `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"` (fresh shells default to an older Node).
- **`src/core` stays untouched and pure**; the client imports its types/functions but does not modify it. The barrel `src/core/index` already exports `ReviewModel`, `FlowView`, `StepView`, `DisplayLine`, `LineKind`, `LeftoverView`, `Intent`, `Verdict`, `ReviewComment`, `FlowVerdict`, `Feedback`, `buildFeedback`, `serializeFeedback`.
- **Vitest has no path-alias resolution configured** — every file that Vitest loads (a `*.test.ts` and anything it imports) MUST use RELATIVE imports (e.g. `../../src/core/index`), never a `@/` alias. Components/page (compiled only by Next) also use relative imports here, for consistency.
- **The two-file JSON contract is unchanged**: Send POSTs a `Feedback` (built by `buildFeedback`) to `/api/feedback`; Abort POSTs to `/api/abort` (writes only the done-signal → the CLI reports "not submitted").
- **TypeScript strict mode on.** Line ranges inclusive, 1-indexed `[start, end]`.
- **Commit messages contain no AI attribution** (no `Co-Authored-By`/tool trailers).

---

### Task 1: Pure review-state module

**Files:**
- Create: `app/lib/review-state.ts`
- Test: `app/lib/review-state.test.ts`

**Interfaces:**
- Consumes: `buildFeedback`, types `Feedback`, `FlowVerdict`, `ReviewComment`, `ReviewModel`, `Verdict` (from `../../src/core/index`).
- Produces:
  - `interface ReviewState { verdicts: Record<string, Verdict>; comments: ReviewComment[] }`
  - `const emptyReviewState: ReviewState`
  - `setVerdict(state, flowId, verdict): ReviewState`
  - `addComment(state, comment): ReviewState`
  - `removeComment(state, index): ReviewState`
  - `allFlowsDecided(model, state): boolean`
  - `toFeedback(state, submittedAt): Feedback`

- [ ] **Step 1: Write the failing test `app/lib/review-state.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  emptyReviewState,
  setVerdict,
  addComment,
  removeComment,
  allFlowsDecided,
  toFeedback,
} from "./review-state";
import type { ReviewModel } from "../../src/core/index";

const model = {
  flows: [
    { id: "a", title: "A", partial: false, steps: [] },
    { id: "b", title: "B", partial: false, steps: [] },
  ],
  leftovers: [],
} as unknown as ReviewModel;

describe("review-state", () => {
  it("records and overwrites per-flow verdicts immutably", () => {
    const s1 = setVerdict(emptyReviewState, "a", "approved");
    const s2 = setVerdict(s1, "a", "changes-requested");
    expect(emptyReviewState.verdicts).toEqual({});
    expect(s2.verdicts).toEqual({ a: "changes-requested" });
  });

  it("adds and removes comments immutably", () => {
    const c = { flowId: "a", path: "x.ts", lines: [3, 3] as [number, number], intent: "must-fix" as const, text: "fix" };
    const withC = addComment(emptyReviewState, c);
    expect(withC.comments).toEqual([c]);
    expect(removeComment(withC, 0).comments).toEqual([]);
    expect(emptyReviewState.comments).toEqual([]);
  });

  it("allFlowsDecided is true only when every flow has a verdict", () => {
    let s = setVerdict(emptyReviewState, "a", "approved");
    expect(allFlowsDecided(model, s)).toBe(false);
    s = setVerdict(s, "b", "approved");
    expect(allFlowsDecided(model, s)).toBe(true);
  });

  it("assembles a valid Feedback via buildFeedback", () => {
    let s = setVerdict(emptyReviewState, "a", "changes-requested");
    s = addComment(s, { flowId: "a", path: "x.ts", lines: [3, 3], intent: "must-fix", text: "fix" });
    const fb = toFeedback(s, "2026-07-02T00:00:00.000Z");
    expect(fb.version).toBe(1);
    expect(fb.submittedAt).toBe("2026-07-02T00:00:00.000Z");
    expect(fb.flows).toEqual([{ id: "a", verdict: "changes-requested" }]);
    expect(fb.comments[0].intent).toBe("must-fix");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- review-state`
Expected: FAIL — `Cannot find module './review-state'`.

- [ ] **Step 3: Create `app/lib/review-state.ts`**

```typescript
import {
  buildFeedback,
  type Feedback,
  type FlowVerdict,
  type ReviewComment,
  type ReviewModel,
  type Verdict,
} from "../../src/core/index";

export interface ReviewState {
  verdicts: Record<string, Verdict>;
  comments: ReviewComment[];
}

export const emptyReviewState: ReviewState = { verdicts: {}, comments: [] };

export function setVerdict(state: ReviewState, flowId: string, verdict: Verdict): ReviewState {
  return { ...state, verdicts: { ...state.verdicts, [flowId]: verdict } };
}

export function addComment(state: ReviewState, comment: ReviewComment): ReviewState {
  return { ...state, comments: [...state.comments, comment] };
}

export function removeComment(state: ReviewState, index: number): ReviewState {
  return { ...state, comments: state.comments.filter((_, i) => i !== index) };
}

export function allFlowsDecided(model: ReviewModel, state: ReviewState): boolean {
  return model.flows.every((f) => state.verdicts[f.id] !== undefined);
}

export function toFeedback(state: ReviewState, submittedAt: string): Feedback {
  const flows: FlowVerdict[] = Object.entries(state.verdicts).map(([id, verdict]) => ({ id, verdict }));
  return buildFeedback(flows, state.comments, submittedAt);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- review-state`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/review-state.ts app/lib/review-state.test.ts
git commit -m "feat(ui): add pure review-state module (verdicts, comments, feedback assembly)"
```

---

### Task 2: Abort endpoint

**Files:**
- Modify: `src/server/context.ts` (add `submitAbort`)
- Create: `app/api/abort/route.ts`
- Test: `src/server/abort.test.ts`

**Interfaces:**
- Consumes: `ServerEnv`, `readEnv` (`./context` / `../../src/server/context`).
- Produces: `submitAbort(env: ServerEnv): void` (writes only `env.donePath`); `POST` handler at `/api/abort` returning `{ ok: true }`.

- [ ] **Step 1: Write the failing test `src/server/abort.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POST } from "../../app/api/abort/route";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "flowreview-abort-"));
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

describe("POST /api/abort", () => {
  it("writes the done-signal without writing a feedback file", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(existsSync(process.env.FLOWREVIEW_DONE as string)).toBe(true);
    expect(existsSync(process.env.FLOWREVIEW_FEEDBACK_OUT as string)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- abort`
Expected: FAIL — cannot find `../../app/api/abort/route`.

- [ ] **Step 3: Add `submitAbort` to `src/server/context.ts`**

Add this exported function (next to `submitFeedback`):

```typescript
export function submitAbort(env: ServerEnv): void {
  writeFileSync(env.donePath, "");
}
```

(`writeFileSync` and `ServerEnv` are already imported/defined in this file.)

- [ ] **Step 4: Create `app/api/abort/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { readEnv, submitAbort } from "../../../src/server/context";

export const dynamic = "force-dynamic";

export async function POST() {
  const env = readEnv(process.env);
  submitAbort(env);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test -- abort`
Expected: PASS — done-signal written, no feedback file.

- [ ] **Step 6: Commit**

```bash
git add src/server/context.ts app/api/abort/route.ts src/server/abort.test.ts
git commit -m "feat(app): add /api/abort to release the blocked CLI without feedback"
```

---

### Task 3: Step + comment-composer components

**Files:**
- Create: `app/components/CommentComposer.tsx`
- Create: `app/components/FlowStep.tsx`

**Interfaces:**
- Consumes: types `Intent`, `LineRange`, `ReviewComment`, `StepView` (`../../src/core/index`).
- Produces: `CommentComposer` (`{ path; lines; flowId; onSubmit; onCancel }`) and `FlowStep` (`{ step; flowId; comments; onAddComment }`) React components.

*(This task is verified by `typecheck` + `build`; the components are presentational and their behavior-bearing logic lives in Task 1's tested module.)*

- [ ] **Step 1: Create `app/components/CommentComposer.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { Intent, LineRange, ReviewComment } from "../../src/core/index";

const INTENTS: { value: Intent; label: string }[] = [
  { value: "must-fix", label: "🔴 Must-fix" },
  { value: "question", label: "❓ Question" },
  { value: "nit", label: "💡 Nit" },
];

export function CommentComposer({
  path,
  lines,
  flowId,
  onSubmit,
  onCancel,
}: {
  path: string;
  lines: LineRange;
  flowId: string;
  onSubmit: (comment: ReviewComment) => void;
  onCancel: () => void;
}) {
  const [intent, setIntent] = useState<Intent>("must-fix");
  const [text, setText] = useState("");

  return (
    <div className="my-1 rounded border border-blue-500 bg-blue-50 p-2">
      <div className="mb-2 flex gap-2">
        {INTENTS.map((it) => (
          <button
            key={it.value}
            type="button"
            onClick={() => setIntent(it.value)}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              intent === it.value ? "border-blue-600 bg-blue-200 font-semibold" : "border-gray-300"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
      <textarea
        className="w-full rounded border border-gray-300 p-1 text-sm"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Comment on this line…"
      />
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={text.trim() === ""}
          onClick={() => onSubmit({ flowId, path, lines, intent, text: text.trim() })}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-40"
        >
          Add
        </button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-0.5 text-xs text-gray-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/components/FlowStep.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ReviewComment, StepView } from "../../src/core/index";
import { CommentComposer } from "./CommentComposer";

export function FlowStep({
  step,
  flowId,
  comments,
  onAddComment,
}: {
  step: StepView;
  flowId: string;
  comments: ReviewComment[];
  onAddComment: (comment: ReviewComment) => void;
}) {
  const [activeLine, setActiveLine] = useState<number | null>(null);

  return (
    <div className="mb-3 rounded border border-gray-300">
      <div className="flex items-center justify-between bg-gray-100 px-3 py-1 text-sm">
        <span>
          <span className="font-semibold">{step.role}</span> · {step.path}
        </span>
        <span className="flex gap-2">
          {step.stale && <span className="rounded bg-amber-200 px-1 text-xs text-amber-800">stale</span>}
          {step.collapsed && step.alreadyReviewedIn && (
            <span className="rounded bg-gray-200 px-1 text-xs text-gray-600">
              already reviewed in {step.alreadyReviewedIn}
            </span>
          )}
        </span>
      </div>
      {!step.collapsed && (
        <div className="text-sm">
          {step.lines.map((line) => {
            const lineComments = comments.filter((c) => c.path === step.path && c.lines[0] === line.number);
            return (
              <div key={line.number}>
                <div
                  onClick={() => setActiveLine(activeLine === line.number ? null : line.number)}
                  className={`cursor-pointer px-3 font-mono ${
                    line.kind === "added" ? "bg-green-100" : "opacity-60"
                  } hover:bg-blue-50`}
                >
                  <span className="mr-3 select-none text-gray-400">{line.number}</span>
                  {line.text || " "}
                </div>
                {lineComments.map((c, i) => (
                  <div key={i} className="mx-3 border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs">
                    <b>{c.intent}</b>: {c.text}
                  </div>
                ))}
                {activeLine === line.number && (
                  <div className="px-3">
                    <CommentComposer
                      path={step.path}
                      lines={[line.number, line.number]}
                      flowId={flowId}
                      onSubmit={(c) => {
                        onAddComment(c);
                        setActiveLine(null);
                      }}
                      onCancel={() => setActiveLine(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm run typecheck && npm run build`
Expected: `tsc --noEmit` exits 0; `next build` succeeds. (The components aren't imported by the page yet — this confirms they compile.)

- [ ] **Step 4: Run the full test suite (no regressions)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm test`
Expected: all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add app/components/CommentComposer.tsx app/components/FlowStep.tsx
git commit -m "feat(ui): add FlowStep and CommentComposer components"
```

---

### Task 4: Progress rail + page composition + Send/Abort

**Files:**
- Create: `app/components/FlowRail.tsx`
- Replace: `app/page.tsx`
- Modify: `README.md` (document the review surface)

**Interfaces:**
- Consumes: `ReviewModel`, `ReviewComment`, `Verdict` (`../../src/core/index`); `ReviewState` + helpers (`../lib/review-state` / `./lib/review-state`); `FlowRail`, `FlowStep` components.
- Produces: the complete focus-mode `app/page.tsx`.

*(Verified by `typecheck` + `build` + a manual browser smoke — the interactive "feel" is validated by a human, which is the tool's purpose.)*

- [ ] **Step 1: Create `app/components/FlowRail.tsx`**

```tsx
"use client";

import type { ReviewModel } from "../../src/core/index";
import type { ReviewState } from "../lib/review-state";

export function FlowRail({
  model,
  state,
  current,
  onSelect,
}: {
  model: ReviewModel;
  state: ReviewState;
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="w-56 shrink-0 border-r border-gray-200 p-3 text-sm">
      {model.flows.map((flow, i) => {
        const verdict = state.verdicts[flow.id];
        const mark = verdict === "approved" ? "✓" : verdict === "changes-requested" ? "✎" : "○";
        const color =
          verdict === "approved" ? "text-green-600" : verdict === "changes-requested" ? "text-amber-600" : "text-gray-400";
        return (
          <button
            key={flow.id}
            type="button"
            onClick={() => onSelect(i)}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left ${
              i === current ? "bg-blue-100 font-semibold" : ""
            }`}
          >
            <span className={color}>{mark}</span>
            <span className="truncate">
              {flow.title}
              {flow.partial && <span className="ml-1 text-xs text-gray-400">(partial)</span>}
            </span>
          </button>
        );
      })}
      {model.leftovers.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-2 text-amber-700">⚠ Leftovers ({model.leftovers.length})</div>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx` with the composed focus-mode surface**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "flowbite-react";
import type { ReviewComment, ReviewModel, Verdict } from "../src/core/index";
import { FlowRail } from "./components/FlowRail";
import { FlowStep } from "./components/FlowStep";
import { addComment, allFlowsDecided, emptyReviewState, setVerdict, toFeedback, type ReviewState } from "./lib/review-state";

export default function Home() {
  const [model, setModel] = useState<ReviewModel | null>(null);
  const [state, setState] = useState<ReviewState>(emptyReviewState);
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState<"reviewing" | "sent" | "aborted">("reviewing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/review")
      .then((r) => {
        if (!r.ok) throw new Error(`review request failed (${r.status})`);
        return r.json();
      })
      .then((d) => setModel(d.model))
      .catch(() => setError("Failed to load the review."));
  }, []);

  async function send() {
    const res = await fetch("/api/feedback", {
      method: "POST",
      body: JSON.stringify(toFeedback(state, new Date().toISOString())),
    });
    if (res.ok) setStatus("sent");
    else setError("Failed to send feedback.");
  }

  async function abort() {
    const res = await fetch("/api/abort", { method: "POST" });
    if (res.ok) setStatus("aborted");
    else setError("Failed to abort.");
  }

  if (error) return <main className="p-8 text-red-700">{error}</main>;
  if (!model) return <main className="p-8">Loading review…</main>;
  if (status === "sent") return <main className="p-8">Feedback sent. You can close this tab.</main>;
  if (status === "aborted") return <main className="p-8">Review aborted. You can close this tab.</main>;

  const flow = model.flows[current];
  const decided = allFlowsDecided(model, state);

  return (
    <div className="flex min-h-screen">
      <FlowRail model={model} state={state} current={current} onSelect={setCurrent} />
      <main className="flex-1 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            {flow.title}
            {flow.partial && <span className="ml-2 text-sm font-normal text-gray-500">(partial — more coming)</span>}
          </h1>
          <span className="text-sm text-gray-500">
            Flow {current + 1} of {model.flows.length}
          </span>
        </div>

        {flow.steps.map((step, i) => (
          <FlowStep
            key={`${step.path}-${i}`}
            step={step}
            flowId={flow.id}
            comments={state.comments}
            onAddComment={(c: ReviewComment) => setState((s) => addComment(s, c))}
          />
        ))}

        <div className="mt-6 flex items-center gap-3 border-t border-gray-200 pt-4">
          <Button color="green" onClick={() => setState((s) => setVerdict(s, flow.id, "approved" as Verdict))}>
            ✓ Approve
          </Button>
          <Button color="yellow" onClick={() => setState((s) => setVerdict(s, flow.id, "changes-requested" as Verdict))}>
            Request changes
          </Button>
          <div className="flex-1" />
          <Button color="light" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
            ◀ Prev
          </Button>
          <Button color="light" disabled={current === model.flows.length - 1} onClick={() => setCurrent((c) => c + 1)}>
            Next ▶
          </Button>
        </div>

        <div className="mt-6 flex gap-3">
          <Button disabled={!decided} onClick={send}>
            Send to agent
          </Button>
          <Button color="light" onClick={abort}>
            Abort review
          </Button>
        </div>
        {!decided && <p className="mt-2 text-xs text-gray-500">Give every flow a verdict to enable Send.</p>}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Update `README.md`** — replace the "Review a change set" section body with:

````markdown
## Review a change set
An agent (or you) writes a `handoff.json` describing the flows (see
`docs/superpowers/specs`), then:
```bash
npm run build                 # once, or after code changes
npm run review -- handoff.json
```
This reconciles the handoff against `git diff`, opens the **focus-mode review**
in your browser (one flow at a time: a progress rail, enclosing-context steps
with collapsed shared-code and stale/partial badges, and line comments with
intent), blocks until you submit, and writes `feedback.json` next to where you
ran it. Give each flow a verdict (Approve / Request changes), add line comments,
then **Send to agent** — or **Abort review** to release the agent without
feedback. The agent then reads `feedback.json` and acts.
````

- [ ] **Step 4: Verify typecheck + build**

Run: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" && npm run typecheck && npm run build && npm test`
Expected: `tsc --noEmit` exits 0; `next build` succeeds with `/`, `/api/review`, `/api/feedback`, `/api/abort` listed; the full test suite passes.

- [ ] **Step 5: Manual browser smoke (human step — do NOT run in an automated agent, it blocks)**

In a repo with an uncommitted change and a matching `handoff.json`:
```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
npm run build
npm run review -- handoff.json
```
Expected: the browser opens to the focus-mode surface; the rail lists flows; steps render with added/context lines, stale/partial badges, and collapsed shared-code markers; clicking a line opens the intent composer and adds a comment; per-flow verdicts light the rail; **Send** (enabled once all flows have verdicts) writes `feedback.json` and the CLI exits 0; **Abort** releases the CLI with "review was not submitted". Record the result in the task report (this step is manual — it opens a browser and cannot be asserted in CI).

- [ ] **Step 6: Commit**

```bash
git add app/components/FlowRail.tsx app/page.tsx README.md
git commit -m "feat(ui): compose focus-mode review surface with verdicts, comments, send, and abort"
```

---

## Self-Review

**1. Spec coverage (Plan 3 slice — the review surface, spec §4 + §7):**
- Focus mode: one flow fills the screen; progress rail lists flows + Leftovers → Task 4 (`FlowRail`, page). ✓
- Steps show enclosing context with added/context line kinds → Task 3 (`FlowStep`, using `DisplayLine.kind`). ✓
- Shared code collapsed + "already reviewed in <flow>" → Task 3 (`step.collapsed` + `step.alreadyReviewedIn`). ✓
- Partial flows marked → Tasks 3/4 (`flow.partial`). ✓
- Stale badge → Task 3 (`step.stale`). ✓
- Line comments with 3-way intent → Tasks 1+3 (`CommentComposer`, `ReviewComment`). ✓
- Per-slice verdict + Send unblocks agent → Tasks 1+4 (`setVerdict`, `allFlowsDecided`, `toFeedback` → `/api/feedback`). ✓
- Abort path (spec §7 "manual abort to release") → Task 2 (`/api/abort`) + Task 4 (Abort button). ✓
- Leftovers surfaced → Task 4 (rail). ✓
- Deferred (not this plan): Claude Code integration (Plan 4); multi-repo, manual re-grouping (spec "later").

**2. Placeholder scan:** No TBD/TODO. Component tasks use `typecheck`+`build`+manual-smoke instead of unit red/green — stated explicitly, not a placeholder (React presentational components; their pure logic is unit-tested in Task 1). Task 4 Step 5 is explicitly a manual human step.

**3. Type consistency:** All types (`ReviewModel`, `FlowView`, `StepView`, `DisplayLine`, `ReviewComment`, `Intent`, `Verdict`, `Feedback`) imported from `../../src/core/index` and used with their Plan-1 shapes (`step.stale`, `step.staleRanges`, `step.collapsed`, `step.alreadyReviewedIn`, `flow.partial`, `line.kind`, `line.number`, `line.text`). `ReviewState`/`setVerdict`/`addComment`/`allFlowsDecided`/`toFeedback` signatures match between Task 1 and Task 4. `submitAbort(env)` matches between Task 2's context.ts and its route. All Vitest-loaded files use relative imports (no `@/`).

## Notes for execution
- Only `app/lib/review-state.ts` (+ its test) and the `/api/abort` route (+ its test) are unit-tested; the four `.tsx` components and the page are verified by `typecheck` + `next build` + the manual smoke (Task 4 Step 5). This mirrors Plan 2's treatment of the page.
- Do NOT run `npm run review` in an automated agent — it boots a server, opens a browser, and blocks for up to an hour. Only the human smoke step runs it.
- The Flowbite `Button` `color` values used are `"green"`, `"yellow"`, `"light"`; if a value is rejected by the installed Flowbite React types/build, adjust to a supported color and note it (does not change behavior).
