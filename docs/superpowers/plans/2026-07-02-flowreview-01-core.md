# FlowReview — Plan 1: Core (contract + reconciliation + view-model)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, framework-agnostic TypeScript core that turns a `handoff.json` + a `git diff` into a review view-model, and validates/serializes `feedback.json`.

**Architecture:** A set of small, DOM-free, dependency-free TS modules under `src/core/`. Data flows: `parseHandoff` + `parseUnifiedDiff` → `reconcile` (Leftovers/stale) → `buildReviewModel` (enclosing context, shared-code dedupe, partial flows). `feedback.ts` is the return path. Everything is unit-tested with Vitest. This is Plan 1 of 4; later plans (Next.js app + CLI, review UI, Claude Code integration) import this core and do not modify its public API.

**Tech Stack:** Node.js ≥ 20, TypeScript 5.7 (strict), Vitest 3. No runtime dependencies.

## Global Constraints

- **Node.js ≥ 20**, **TypeScript strict mode** on.
- **Core has zero runtime dependencies** — only dev tooling (`typescript`, `vitest`, `@types/node`).
- Core is **pure and DOM-free** — no `fs`, no `http`, no `git` invocation (callers inject file contents and parsed diffs). This keeps it unit-testable and framework-agnostic.
- **Line ranges are inclusive and 1-indexed**, represented as `[start, end]` tuples.
- **Commit messages contain no AI attribution** (no `Co-Authored-By`/tool trailers).
- Public API of `src/core/` is consumed by later plans — do not rename exported symbols without updating this sequence.

---

### Task 1: Project scaffold + contract types + handoff validation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/core/types.ts`
- Create: `src/core/internal.ts`
- Create: `src/core/schema.ts`
- Test: `src/core/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Types `Handoff`, `HandoffFlow`, `HandoffStep`, `LineRange` (`[number, number]`), `Intent` (`"must-fix" | "question" | "nit"`), `Verdict` (`"approved" | "changes-requested"`), `Feedback`, `FlowVerdict`, `ReviewComment`.
  - `isObject(v: unknown): v is Record<string, unknown>` from `core/internal`.
  - `parseHandoff(input: string | unknown): Handoff` (throws `HandoffValidationError`) from `core/schema`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "flowreview",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
node_modules/
dist/
.next/
*.tsbuildinfo
handoff.json
feedback.json
```

- [ ] **Step 4: Install dev dependencies**

Run: `npm install`
Expected: `node_modules/` and `package-lock.json` are created, no errors.

- [ ] **Step 5: Create `src/core/types.ts`**

```typescript
/** Inclusive, 1-indexed line range: [start, end]. */
export type LineRange = [start: number, end: number];

// ---- handoff.json (agent -> tool) ----

export interface Handoff {
  version: 1;
  root: string;
  base: string; // "working-tree" or a git ref
  feature?: string;
  flows: HandoffFlow[];
}

export interface HandoffFlow {
  id: string;
  title: string;
  /** When false, the slice is partial ("more coming"); the UI shows a badge. */
  complete?: boolean;
  steps: HandoffStep[];
}

export interface HandoffStep {
  path: string;
  ranges: LineRange[];
  role: string; // free-text, stack-agnostic label (e.g. "migration", "model", "ui")
  note?: string;
}

// ---- feedback.json (tool -> agent) ----

export type Intent = "must-fix" | "question" | "nit";
export type Verdict = "approved" | "changes-requested";

export interface Feedback {
  version: 1;
  submittedAt: string;
  flows: FlowVerdict[];
  comments: ReviewComment[];
}

export interface FlowVerdict {
  id: string;
  verdict: Verdict;
}

export interface ReviewComment {
  flowId: string;
  path: string;
  lines: LineRange;
  intent: Intent;
  text: string;
}
```

- [ ] **Step 6: Create `src/core/internal.ts`**

```typescript
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
```

- [ ] **Step 7: Write the failing test `src/core/schema.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseHandoff, HandoffValidationError } from "./schema";

const valid = {
  version: 1,
  root: "/repo",
  base: "working-tree",
  feature: "Bookings",
  flows: [
    {
      id: "create-booking",
      title: "Create booking",
      complete: false,
      steps: [
        { path: "app/models/booking.rb", ranges: [[3, 3]], role: "model", note: "adds validation" },
      ],
    },
  ],
};

describe("parseHandoff", () => {
  it("accepts a valid handoff (object or JSON string)", () => {
    const fromObj = parseHandoff(valid);
    expect(fromObj.flows[0].id).toBe("create-booking");
    expect(fromObj.flows[0].steps[0].ranges[0]).toEqual([3, 3]);
    const fromStr = parseHandoff(JSON.stringify(valid));
    expect(fromStr).toEqual(fromObj);
  });

  it("rejects a wrong version", () => {
    expect(() => parseHandoff({ ...valid, version: 2 })).toThrow(HandoffValidationError);
  });

  it("rejects an empty flows array", () => {
    expect(() => parseHandoff({ ...valid, flows: [] })).toThrow(/non-empty array/);
  });

  it("rejects duplicate flow ids", () => {
    const dup = { ...valid, flows: [valid.flows[0], valid.flows[0]] };
    expect(() => parseHandoff(dup)).toThrow(/duplicate flow id/);
  });

  it("rejects a range whose end < start", () => {
    const bad = structuredClone(valid);
    bad.flows[0].steps[0].ranges = [[5, 2]];
    expect(() => parseHandoff(bad)).toThrow(/end must be >= start/);
  });

  it("rejects invalid JSON strings", () => {
    expect(() => parseHandoff("{not json")).toThrow(HandoffValidationError);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL — `Cannot find module './schema'` (schema.ts not created yet).

- [ ] **Step 9: Create `src/core/schema.ts`**

```typescript
import type { Handoff, HandoffFlow, HandoffStep, LineRange } from "./types";
import { isObject } from "./internal";

export class HandoffValidationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "HandoffValidationError";
  }
}

export function parseHandoff(input: string | unknown): Handoff {
  const data = typeof input === "string" ? safeJson(input) : input;
  if (!isObject(data)) throw new HandoffValidationError("handoff must be a JSON object");
  if (data.version !== 1) throw new HandoffValidationError("handoff.version must be 1");
  if (typeof data.root !== "string" || data.root.length === 0)
    throw new HandoffValidationError("handoff.root must be a non-empty string");
  if (typeof data.base !== "string" || data.base.length === 0)
    throw new HandoffValidationError("handoff.base must be a non-empty string");
  if (data.feature !== undefined && typeof data.feature !== "string")
    throw new HandoffValidationError("handoff.feature must be a string when present");
  if (!Array.isArray(data.flows) || data.flows.length === 0)
    throw new HandoffValidationError("handoff.flows must be a non-empty array");

  const ids = new Set<string>();
  const flows = data.flows.map((f, i) => parseFlow(f, i, ids));

  return {
    version: 1,
    root: data.root,
    base: data.base,
    ...(data.feature !== undefined ? { feature: data.feature as string } : {}),
    flows,
  };
}

function parseFlow(f: unknown, i: number, ids: Set<string>): HandoffFlow {
  if (!isObject(f)) throw new HandoffValidationError(`flows[${i}] must be an object`);
  if (typeof f.id !== "string" || f.id.length === 0)
    throw new HandoffValidationError(`flows[${i}].id must be a non-empty string`);
  if (ids.has(f.id)) throw new HandoffValidationError(`duplicate flow id: ${f.id}`);
  ids.add(f.id);
  if (typeof f.title !== "string" || f.title.length === 0)
    throw new HandoffValidationError(`flows[${i}].title must be a non-empty string`);
  if (f.complete !== undefined && typeof f.complete !== "boolean")
    throw new HandoffValidationError(`flows[${i}].complete must be a boolean when present`);
  if (!Array.isArray(f.steps) || f.steps.length === 0)
    throw new HandoffValidationError(`flows[${i}].steps must be a non-empty array`);

  const steps = f.steps.map((s, j) => parseStep(s, i, j));
  return {
    id: f.id,
    title: f.title,
    ...(f.complete !== undefined ? { complete: f.complete as boolean } : {}),
    steps,
  };
}

function parseStep(s: unknown, i: number, j: number): HandoffStep {
  const where = `flows[${i}].steps[${j}]`;
  if (!isObject(s)) throw new HandoffValidationError(`${where} must be an object`);
  if (typeof s.path !== "string" || s.path.length === 0)
    throw new HandoffValidationError(`${where}.path must be a non-empty string`);
  if (typeof s.role !== "string" || s.role.length === 0)
    throw new HandoffValidationError(`${where}.role must be a non-empty string`);
  if (s.note !== undefined && typeof s.note !== "string")
    throw new HandoffValidationError(`${where}.note must be a string when present`);
  if (!Array.isArray(s.ranges) || s.ranges.length === 0)
    throw new HandoffValidationError(`${where}.ranges must be a non-empty array`);

  const ranges = s.ranges.map((r, k) => parseRange(r, `${where}.ranges[${k}]`));
  return {
    path: s.path,
    role: s.role,
    ...(s.note !== undefined ? { note: s.note as string } : {}),
    ranges,
  };
}

function parseRange(r: unknown, where: string): LineRange {
  if (!Array.isArray(r) || r.length !== 2)
    throw new HandoffValidationError(`${where} must be a [start, end] pair`);
  const [start, end] = r as [unknown, unknown];
  if (!Number.isInteger(start) || !Number.isInteger(end))
    throw new HandoffValidationError(`${where} start and end must be integers`);
  if ((start as number) < 1) throw new HandoffValidationError(`${where} start must be >= 1`);
  if ((end as number) < (start as number))
    throw new HandoffValidationError(`${where} end must be >= start`);
  return [start as number, end as number];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new HandoffValidationError(`handoff is not valid JSON: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm test -- schema`
Expected: PASS — all 6 tests green.

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json .gitignore src/core/types.ts src/core/internal.ts src/core/schema.ts src/core/schema.test.ts package-lock.json
git commit -m "feat(core): scaffold project and add handoff schema validation"
```

---

### Task 2: Unified diff parser

**Files:**
- Create: `src/core/diff.ts`
- Test: `src/core/diff.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - Types `FileStatus` (`"added" | "modified" | "deleted" | "renamed"`), `FileDiff` (`{ path: string; status: FileStatus; oldPath?: string; addedLines: number[] }`), `Diff` (`{ files: FileDiff[] }`).
  - `parseUnifiedDiff(raw: string): Diff` — `addedLines` are 1-indexed NEW-file line numbers of added lines.
  - `changedLinesByPath(diff: Diff): Map<string, Set<number>>`.

- [ ] **Step 1: Write the failing test `src/core/diff.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseUnifiedDiff, changedLinesByPath } from "./diff";

const raw = `diff --git a/app/models/booking.rb b/app/models/booking.rb
index e69de29..1234567 100644
--- a/app/models/booking.rb
+++ b/app/models/booking.rb
@@ -3,3 +3,4 @@ class Booking < ApplicationRecord
   belongs_to :user
+  validates :end_at, comparison: { greater_than: :start_at }
   scope :upcoming, -> { where("start_at > ?", Time.now) }
 end
diff --git a/web/src/BookingForm.tsx b/web/src/BookingForm.tsx
new file mode 100644
--- /dev/null
+++ b/web/src/BookingForm.tsx
@@ -0,0 +1,3 @@
+export function BookingForm() {
+  return null
+}
`;

describe("parseUnifiedDiff", () => {
  it("parses two files with correct new-file added line numbers", () => {
    const diff = parseUnifiedDiff(raw);
    expect(diff.files.length).toBe(2);

    const booking = diff.files[0];
    expect(booking.path).toBe("app/models/booking.rb");
    expect(booking.status).toBe("modified");
    expect(booking.addedLines).toEqual([4]);

    const form = diff.files[1];
    expect(form.path).toBe("web/src/BookingForm.tsx");
    expect(form.status).toBe("added");
    expect(form.addedLines).toEqual([1, 2, 3]);
  });

  it("indexes changed lines by path", () => {
    const map = changedLinesByPath(parseUnifiedDiff(raw));
    expect(map.get("app/models/booking.rb")?.has(4)).toBe(true);
    expect(map.get("web/src/BookingForm.tsx")?.size).toBe(3);
  });

  it("returns no files for an empty diff", () => {
    expect(parseUnifiedDiff("").files).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- diff`
Expected: FAIL — `Cannot find module './diff'`.

- [ ] **Step 3: Create `src/core/diff.ts`**

```typescript
export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileDiff {
  /** New path; for deleted files this is the old path. */
  path: string;
  status: FileStatus;
  oldPath?: string;
  /** 1-indexed line numbers in the NEW file that were added. */
  addedLines: number[];
}

export interface Diff {
  files: FileDiff[];
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function strip(p: string): string {
  return p.replace(/^[ab]\//, "");
}

export function parseUnifiedDiff(raw: string): Diff {
  const files: FileDiff[] = [];
  let cur: FileDiff | null = null;
  let newLineNo = 0; // 0 means "not inside a hunk yet"

  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git")) {
      if (cur) files.push(cur);
      cur = { path: "", status: "modified", addedLines: [] };
      newLineNo = 0;
      continue;
    }
    if (!cur) continue;

    if (line.startsWith("new file mode")) { cur.status = "added"; continue; }
    if (line.startsWith("deleted file mode")) { cur.status = "deleted"; continue; }
    if (line.startsWith("rename from ")) {
      cur.status = "renamed";
      cur.oldPath = strip(line.slice("rename from ".length).trim());
      continue;
    }
    if (line.startsWith("rename to ")) {
      cur.status = "renamed";
      cur.path = strip(line.slice("rename to ".length).trim());
      continue;
    }
    if (line.startsWith("--- ")) {
      const p = line.slice(4).trim();
      if (p !== "/dev/null") cur.oldPath = strip(p);
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      if (p === "/dev/null") {
        cur.status = "deleted";
        if (cur.oldPath) cur.path = cur.oldPath;
      } else {
        cur.path = strip(p);
      }
      continue;
    }

    const hunk = HUNK.exec(line);
    if (hunk) { newLineNo = Number(hunk[1]); continue; }
    if (newLineNo === 0) continue;

    if (line.startsWith("+")) { cur.addedLines.push(newLineNo); newLineNo++; continue; }
    if (line.startsWith("-")) continue; // deletion: no new-file line
    if (line.startsWith("\\")) continue; // "\ No newline at end of file"
    if (line.startsWith(" ")) { newLineNo++; continue; } // context line (incl. blank " ")
  }

  if (cur) files.push(cur);
  return { files: files.filter((f) => f.path.length > 0) };
}

export function changedLinesByPath(diff: Diff): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const f of diff.files) map.set(f.path, new Set(f.addedLines));
  return map;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- diff`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/diff.ts src/core/diff.test.ts
git commit -m "feat(core): parse unified git diff into changed new-file lines"
```

---

### Task 3: Reconcile handoff against the diff (Leftovers + stale)

**Files:**
- Create: `src/core/reconcile.ts`
- Test: `src/core/reconcile.test.ts`

**Interfaces:**
- Consumes: `Handoff` (`core/types`), `Diff` + `changedLinesByPath` (`core/diff`).
- Produces:
  - Types `ReconciledStep` (`{ path; role; note?; ranges: LineRange[]; staleRanges: LineRange[] }`), `ReconciledFlow` (`{ id; title; complete?; steps: ReconciledStep[] }`), `Leftover` (`{ path: string; ranges: LineRange[] }`), `ReconcileResult` (`{ flows: ReconciledFlow[]; leftovers: Leftover[] }`).
  - `reconcile(handoff: Handoff, diff: Diff): ReconcileResult`.

- [ ] **Step 1: Write the failing test `src/core/reconcile.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";
import type { Diff } from "./diff";
import type { Handoff } from "./types";

const handoff: Handoff = {
  version: 1,
  root: "/repo",
  base: "working-tree",
  flows: [
    {
      id: "create-booking",
      title: "Create booking",
      steps: [
        { path: "app/models/booking.rb", ranges: [[4, 4]], role: "model" },
        { path: "app/controllers/bookings_controller.rb", ranges: [[9, 10]], role: "endpoint" },
        { path: "app/models/booking.rb", ranges: [[99, 99]], role: "model" }, // stale
      ],
    },
  ],
};

const diff: Diff = {
  files: [
    { path: "app/models/booking.rb", status: "modified", addedLines: [4] },
    { path: "app/controllers/bookings_controller.rb", status: "modified", addedLines: [9, 10] },
    { path: "config/routes.rb", status: "modified", addedLines: [22] }, // unclaimed -> leftover
  ],
};

describe("reconcile", () => {
  it("flags a step whose lines are not in the diff as stale", () => {
    const result = reconcile(handoff, diff);
    expect(result.flows[0].steps[0].staleRanges).toEqual([]);
    expect(result.flows[0].steps[2].staleRanges).toEqual([[99, 99]]);
  });

  it("collects changed-but-unclaimed lines into leftovers, merged into ranges", () => {
    const result = reconcile(handoff, diff);
    expect(result.leftovers).toEqual([{ path: "config/routes.rb", ranges: [[22, 22]] }]);
  });

  it("does not treat claimed lines as leftovers", () => {
    const result = reconcile(handoff, diff);
    const paths = result.leftovers.map((l) => l.path);
    expect(paths).not.toContain("app/models/booking.rb");
    expect(paths).not.toContain("app/controllers/bookings_controller.rb");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- reconcile`
Expected: FAIL — `Cannot find module './reconcile'`.

- [ ] **Step 3: Create `src/core/reconcile.ts`**

```typescript
import type { Handoff, LineRange } from "./types";
import { changedLinesByPath, type Diff } from "./diff";

export interface ReconciledStep {
  path: string;
  role: string;
  note?: string;
  ranges: LineRange[];
  staleRanges: LineRange[];
}

export interface ReconciledFlow {
  id: string;
  title: string;
  complete?: boolean;
  steps: ReconciledStep[];
}

export interface Leftover {
  path: string;
  ranges: LineRange[];
}

export interface ReconcileResult {
  flows: ReconciledFlow[];
  leftovers: Leftover[];
}

function expand(range: LineRange): number[] {
  const [s, e] = range;
  const out: number[] = [];
  for (let i = s; i <= e; i++) out.push(i);
  return out;
}

function toRanges(sorted: number[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else ranges.push([n, n]);
  }
  return ranges;
}

export function reconcile(handoff: Handoff, diff: Diff): ReconcileResult {
  const changed = changedLinesByPath(diff);
  const covered = new Map<string, Set<number>>();

  const flows: ReconciledFlow[] = handoff.flows.map((flow) => {
    const steps: ReconciledStep[] = flow.steps.map((step) => {
      const changedForPath = changed.get(step.path) ?? new Set<number>();
      const staleRanges: LineRange[] = [];
      for (const range of step.ranges) {
        const lines = expand(range).filter((n) => changedForPath.has(n));
        if (lines.length === 0) {
          staleRanges.push(range);
        } else {
          let set = covered.get(step.path);
          if (!set) {
            set = new Set<number>();
            covered.set(step.path, set);
          }
          for (const n of lines) set.add(n);
        }
      }
      return {
        path: step.path,
        role: step.role,
        ...(step.note !== undefined ? { note: step.note } : {}),
        ranges: step.ranges,
        staleRanges,
      };
    });
    return {
      id: flow.id,
      title: flow.title,
      ...(flow.complete !== undefined ? { complete: flow.complete } : {}),
      steps,
    };
  });

  const leftovers: Leftover[] = [];
  for (const [path, changedSet] of changed) {
    const coveredSet = covered.get(path) ?? new Set<number>();
    const uncovered = [...changedSet].filter((n) => !coveredSet.has(n)).sort((a, b) => a - b);
    if (uncovered.length > 0) leftovers.push({ path, ranges: toRanges(uncovered) });
  }
  leftovers.sort((a, b) => a.path.localeCompare(b.path));

  return { flows, leftovers };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- reconcile`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/reconcile.ts src/core/reconcile.test.ts
git commit -m "feat(core): reconcile handoff against diff for leftovers and stale ranges"
```

---

### Task 4: Enclosing-context heuristic

**Files:**
- Create: `src/core/context.ts`
- Test: `src/core/context.test.ts`

**Interfaces:**
- Consumes: `LineRange` (`core/types`).
- Produces: `enclosingContext(lines: string[], range: LineRange): LineRange` — given the full NEW-file lines (0-indexed array) and a 1-indexed target range, returns the 1-indexed inclusive range of the enclosing block (by indentation heuristic), always containing the target.

- [ ] **Step 1: Write the failing test `src/core/context.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { enclosingContext } from "./context";

describe("enclosingContext", () => {
  it("expands to the enclosing class in an `end`-delimited language", () => {
    const lines = [
      "# frozen_string_literal: true",                 // 1
      "",                                               // 2
      "class Booking < ApplicationRecord",              // 3
      "  belongs_to :user",                             // 4
      "  validates :end_at, greater_than: :start_at",   // 5
      "  scope :upcoming, -> { where('x') }",           // 6
      "end",                                            // 7
    ];
    expect(enclosingContext(lines, [5, 5])).toEqual([3, 7]);
  });

  it("expands to the enclosing function in a brace-delimited language", () => {
    const lines = [
      "export function create(req, res) {", // 1
      "  const data = parse(req)",          // 2
      "  const booking = build(data)",      // 3
      "  return res.json(booking)",         // 4
      "}",                                  // 5
    ];
    expect(enclosingContext(lines, [3, 3])).toEqual([1, 5]);
  });

  it("returns nearby top-level lines when there is no enclosing block", () => {
    const lines = ["const A = 1", "const B = 2"];
    expect(enclosingContext(lines, [2, 2])).toEqual([1, 2]);
  });

  it("always contains the target range", () => {
    const lines = ["a", "b", "c", "d"];
    const [s, e] = enclosingContext(lines, [2, 3]);
    expect(s).toBeLessThanOrEqual(2);
    expect(e).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- context`
Expected: FAIL — `Cannot find module './context'`.

- [ ] **Step 3: Create `src/core/context.ts`**

```typescript
import type { LineRange } from "./types";

/** Leading-whitespace width of a line, or null for a blank line. */
function indentOf(line: string): number | null {
  if (line.trim() === "") return null;
  const m = /^[ \t]*/.exec(line);
  return m ? m[0].length : 0;
}

/**
 * Heuristic (indentation-based, stack-agnostic) enclosing block for `range`.
 * v1 limitation: in indentation-only languages (e.g. Python) it may include one
 * trailing sibling line; expand/collapse in the UI mitigates this.
 */
export function enclosingContext(lines: string[], range: LineRange): LineRange {
  const total = lines.length;
  const s = Math.max(1, range[0]);
  const e = Math.min(total, range[1]);

  // Target indent = min indent among non-blank lines in [s, e].
  let targetIndent = Infinity;
  for (let i = s; i <= e; i++) {
    const ind = indentOf(lines[i - 1]);
    if (ind !== null && ind < targetIndent) targetIndent = ind;
  }
  if (!Number.isFinite(targetIndent)) targetIndent = 0;

  // Header = nearest non-blank line above `s` with indent < targetIndent.
  let headerLine = 1;
  let headerIndent = 0;
  for (let i = s - 1; i >= 1; i--) {
    const ind = indentOf(lines[i - 1]);
    if (ind === null) continue;
    if (ind < targetIndent) {
      headerLine = i;
      headerIndent = ind;
      break;
    }
  }

  // Block end = nearest non-blank line below `e` with indent <= headerIndent.
  // Include it when it sits exactly at header indent (the closing `}` / `end`).
  let blockEnd = total;
  for (let j = e + 1; j <= total; j++) {
    const ind = indentOf(lines[j - 1]);
    if (ind === null) continue;
    if (ind <= headerIndent) {
      blockEnd = ind === headerIndent ? j : j - 1;
      break;
    }
  }

  return [Math.min(headerLine, s), Math.max(blockEnd, e)];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- context`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/context.ts src/core/context.test.ts
git commit -m "feat(core): add indentation-based enclosing-context heuristic"
```

---

### Task 5: Build the review view-model

**Files:**
- Create: `src/core/review-model.ts`
- Test: `src/core/review-model.test.ts`

**Interfaces:**
- Consumes: `Handoff` (`core/types`), `Diff` + `changedLinesByPath` (`core/diff`), `reconcile`/`ReconcileResult`/`Leftover` (`core/reconcile`), `enclosingContext` (`core/context`).
- Produces:
  - Types `LineKind` (`"added" | "context"`), `DisplayLine` (`{ number: number; text: string; kind: LineKind }`), `StepView` (`{ path; role; note?; displayRange: LineRange; lines: DisplayLine[]; stale: boolean; collapsed: boolean; alreadyReviewedIn?: string }`), `FlowView` (`{ id; title; partial: boolean; steps: StepView[] }`), `LeftoverView` (`{ path: string; ranges: LineRange[] }`), `ReviewModel` (`{ feature?: string; flows: FlowView[]; leftovers: LeftoverView[] }`), `FileReader` (`(path: string) => string[]`).
  - `buildReviewModel(handoff: Handoff, diff: Diff, readFile: FileReader): ReviewModel`.

- [ ] **Step 1: Write the failing test `src/core/review-model.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildReviewModel, type FileReader } from "./review-model";
import type { Diff } from "./diff";
import type { Handoff } from "./types";

const files: Record<string, string[]> = {
  "app/models/booking.rb": [
    "class Booking < ApplicationRecord",             // 1
    "  belongs_to :user",                            // 2
    "  validates :end_at, greater_than: :start_at",  // 3
    "end",                                           // 4
  ],
  "app/controllers/bookings_controller.rb": [
    "class BookingsController",   // 1
    "  def create",               // 2
    "    Booking.create!(params)",// 3
    "  end",                      // 4
    "end",                        // 5
  ],
};
const readFile: FileReader = (p) => files[p] ?? [];

const diff: Diff = {
  files: [
    { path: "app/models/booking.rb", status: "modified", addedLines: [3] },
    { path: "app/controllers/bookings_controller.rb", status: "modified", addedLines: [3] },
  ],
};

const handoff: Handoff = {
  version: 1,
  root: "/repo",
  base: "working-tree",
  feature: "Bookings",
  flows: [
    {
      id: "create-booking",
      title: "Create booking",
      complete: false,
      steps: [
        { path: "app/models/booking.rb", ranges: [[3, 3]], role: "model" },
        { path: "app/controllers/bookings_controller.rb", ranges: [[3, 3]], role: "endpoint" },
      ],
    },
    {
      id: "cancel-booking",
      title: "Cancel booking",
      steps: [{ path: "app/models/booking.rb", ranges: [[3, 3]], role: "model" }],
    },
  ],
};

describe("buildReviewModel", () => {
  it("renders a step with enclosing context and per-line kinds", () => {
    const model = buildReviewModel(handoff, diff, readFile);
    const step = model.flows[0].steps[0];
    expect(step.displayRange).toEqual([1, 4]);
    expect(step.lines.map((l) => l.number)).toEqual([1, 2, 3, 4]);
    expect(step.lines[2]).toEqual({
      number: 3,
      text: "  validates :end_at, greater_than: :start_at",
      kind: "added",
    });
    expect(step.lines[0].kind).toBe("context");
  });

  it("marks a partial flow", () => {
    const model = buildReviewModel(handoff, diff, readFile);
    expect(model.flows[0].partial).toBe(true);
    expect(model.flows[1].partial).toBe(false);
  });

  it("collapses shared code seen in an earlier flow and records where", () => {
    const model = buildReviewModel(handoff, diff, readFile);
    expect(model.flows[0].steps[0].collapsed).toBe(false);
    const shared = model.flows[1].steps[0];
    expect(shared.collapsed).toBe(true);
    expect(shared.alreadyReviewedIn).toBe("create-booking");
  });

  it("carries feature label through", () => {
    expect(buildReviewModel(handoff, diff, readFile).feature).toBe("Bookings");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- review-model`
Expected: FAIL — `Cannot find module './review-model'`.

- [ ] **Step 3: Create `src/core/review-model.ts`**

```typescript
import type { Handoff, LineRange } from "./types";
import { changedLinesByPath, type Diff } from "./diff";
import { reconcile, type Leftover } from "./reconcile";
import { enclosingContext } from "./context";

export type LineKind = "added" | "context";

export interface DisplayLine {
  number: number;
  text: string;
  kind: LineKind;
}

export interface StepView {
  path: string;
  role: string;
  note?: string;
  displayRange: LineRange;
  lines: DisplayLine[];
  stale: boolean;
  collapsed: boolean;
  alreadyReviewedIn?: string;
}

export interface FlowView {
  id: string;
  title: string;
  partial: boolean;
  steps: StepView[];
}

export interface LeftoverView {
  path: string;
  ranges: LineRange[];
}

export interface ReviewModel {
  feature?: string;
  flows: FlowView[];
  leftovers: LeftoverView[];
}

export type FileReader = (path: string) => string[];

function hull(ranges: LineRange[]): LineRange {
  let s = Infinity;
  let e = -Infinity;
  for (const [a, b] of ranges) {
    if (a < s) s = a;
    if (b > e) e = b;
  }
  return [s, e];
}

function overlaps(a: LineRange, b: LineRange): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function buildReviewModel(handoff: Handoff, diff: Diff, readFile: FileReader): ReviewModel {
  const result = reconcile(handoff, diff);
  const changed = changedLinesByPath(diff);
  const seen = new Map<string, { flowId: string; range: LineRange }[]>();

  const flows: FlowView[] = result.flows.map((flow) => {
    const steps: StepView[] = flow.steps.map((step) => {
      const lines = readFile(step.path);
      const span = hull(step.ranges);
      const display = enclosingContext(lines, span);
      const changedForPath = changed.get(step.path) ?? new Set<number>();

      const displayLines: DisplayLine[] = [];
      for (let n = display[0]; n <= display[1]; n++) {
        displayLines.push({
          number: n,
          text: lines[n - 1] ?? "",
          kind: changedForPath.has(n) ? "added" : "context",
        });
      }

      const prior = (seen.get(step.path) ?? []).find((p) => overlaps(p.range, span));
      const view: StepView = {
        path: step.path,
        role: step.role,
        ...(step.note !== undefined ? { note: step.note } : {}),
        displayRange: display,
        lines: displayLines,
        stale: step.staleRanges.length > 0,
        collapsed: prior !== undefined,
        ...(prior ? { alreadyReviewedIn: prior.flowId } : {}),
      };

      const entries = seen.get(step.path) ?? [];
      entries.push({ flowId: flow.id, range: span });
      seen.set(step.path, entries);

      return view;
    });

    return {
      id: flow.id,
      title: flow.title,
      partial: flow.complete === false,
      steps,
    };
  });

  const leftovers: LeftoverView[] = result.leftovers.map((l: Leftover) => ({
    path: l.path,
    ranges: l.ranges,
  }));

  return {
    ...(handoff.feature !== undefined ? { feature: handoff.feature } : {}),
    flows,
    leftovers,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- review-model`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/review-model.ts src/core/review-model.test.ts
git commit -m "feat(core): build review view-model with context, dedupe, partial flows"
```

---

### Task 6: Feedback validation/serialization + public barrel

**Files:**
- Create: `src/core/feedback.ts`
- Create: `src/core/index.ts`
- Test: `src/core/feedback.test.ts`

**Interfaces:**
- Consumes: `Feedback`, `FlowVerdict`, `ReviewComment`, `Intent`, `Verdict`, `LineRange` (`core/types`); `isObject` (`core/internal`).
- Produces:
  - `buildFeedback(flows: FlowVerdict[], comments: ReviewComment[], submittedAt: string): Feedback`.
  - `serializeFeedback(feedback: Feedback): string` (pretty JSON + trailing newline).
  - `parseFeedback(input: string | unknown): Feedback` (throws `FeedbackValidationError`).
  - `src/core/index.ts` re-exporting every core module (the package's public API).

- [ ] **Step 1: Write the failing test `src/core/feedback.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildFeedback, serializeFeedback, parseFeedback, FeedbackValidationError } from "./feedback";
import * as core from "./index";

describe("feedback", () => {
  it("round-trips build -> serialize -> parse", () => {
    const fb = buildFeedback(
      [{ id: "create-booking", verdict: "changes-requested" }],
      [
        {
          flowId: "create-booking",
          path: "app/models/booking.rb",
          lines: [3, 3],
          intent: "must-fix",
          text: "add a DB constraint too",
        },
      ],
      "2026-07-02T12:00:00.000Z",
    );
    const json = serializeFeedback(fb);
    expect(json.endsWith("\n")).toBe(true);
    expect(parseFeedback(json)).toEqual(fb);
  });

  it("rejects an invalid intent", () => {
    const bad = {
      version: 1,
      submittedAt: "2026-07-02T12:00:00.000Z",
      flows: [],
      comments: [{ flowId: "f", path: "a", lines: [1, 1], intent: "blocker", text: "x" }],
    };
    expect(() => parseFeedback(bad)).toThrow(FeedbackValidationError);
  });

  it("rejects an invalid verdict", () => {
    const bad = {
      version: 1,
      submittedAt: "2026-07-02T12:00:00.000Z",
      flows: [{ id: "f", verdict: "lgtm" }],
      comments: [],
    };
    expect(() => parseFeedback(bad)).toThrow(/verdict/);
  });

  it("exposes the full public API from the barrel", () => {
    expect(typeof core.parseHandoff).toBe("function");
    expect(typeof core.parseUnifiedDiff).toBe("function");
    expect(typeof core.reconcile).toBe("function");
    expect(typeof core.buildReviewModel).toBe("function");
    expect(typeof core.buildFeedback).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- feedback`
Expected: FAIL — `Cannot find module './feedback'` (and `./index`).

- [ ] **Step 3: Create `src/core/feedback.ts`**

```typescript
import type { Feedback, FlowVerdict, ReviewComment, Intent, Verdict, LineRange } from "./types";
import { isObject } from "./internal";

export class FeedbackValidationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

const INTENTS: readonly Intent[] = ["must-fix", "question", "nit"];
const VERDICTS: readonly Verdict[] = ["approved", "changes-requested"];

export function buildFeedback(
  flows: FlowVerdict[],
  comments: ReviewComment[],
  submittedAt: string,
): Feedback {
  return { version: 1, submittedAt, flows, comments };
}

export function serializeFeedback(feedback: Feedback): string {
  return JSON.stringify(feedback, null, 2) + "\n";
}

export function parseFeedback(input: string | unknown): Feedback {
  const data = typeof input === "string" ? safeJson(input) : input;
  if (!isObject(data)) throw new FeedbackValidationError("feedback must be an object");
  if (data.version !== 1) throw new FeedbackValidationError("feedback.version must be 1");
  if (typeof data.submittedAt !== "string" || data.submittedAt.length === 0)
    throw new FeedbackValidationError("feedback.submittedAt must be a non-empty string");
  if (!Array.isArray(data.flows)) throw new FeedbackValidationError("feedback.flows must be an array");
  if (!Array.isArray(data.comments))
    throw new FeedbackValidationError("feedback.comments must be an array");

  const flows = data.flows.map((f, i) => parseVerdict(f, i));
  const comments = data.comments.map((c, i) => parseComment(c, i));
  return { version: 1, submittedAt: data.submittedAt, flows, comments };
}

function parseVerdict(f: unknown, i: number): FlowVerdict {
  if (!isObject(f)) throw new FeedbackValidationError(`flows[${i}] must be an object`);
  if (typeof f.id !== "string" || f.id.length === 0)
    throw new FeedbackValidationError(`flows[${i}].id must be a non-empty string`);
  if (!VERDICTS.includes(f.verdict as Verdict))
    throw new FeedbackValidationError(`flows[${i}].verdict must be one of ${VERDICTS.join(", ")}`);
  return { id: f.id, verdict: f.verdict as Verdict };
}

function parseComment(c: unknown, i: number): ReviewComment {
  const where = `comments[${i}]`;
  if (!isObject(c)) throw new FeedbackValidationError(`${where} must be an object`);
  if (typeof c.flowId !== "string" || c.flowId.length === 0)
    throw new FeedbackValidationError(`${where}.flowId must be a non-empty string`);
  if (typeof c.path !== "string" || c.path.length === 0)
    throw new FeedbackValidationError(`${where}.path must be a non-empty string`);
  if (typeof c.text !== "string")
    throw new FeedbackValidationError(`${where}.text must be a string`);
  if (!INTENTS.includes(c.intent as Intent))
    throw new FeedbackValidationError(`${where}.intent must be one of ${INTENTS.join(", ")}`);
  const lines = parseLines(c.lines, where);
  return { flowId: c.flowId, path: c.path, lines, intent: c.intent as Intent, text: c.text };
}

function parseLines(v: unknown, where: string): LineRange {
  if (!Array.isArray(v) || v.length !== 2)
    throw new FeedbackValidationError(`${where}.lines must be a [start, end] pair`);
  const [start, end] = v as [unknown, unknown];
  if (!Number.isInteger(start) || !Number.isInteger(end))
    throw new FeedbackValidationError(`${where}.lines must be integers`);
  if ((start as number) < 1 || (end as number) < (start as number))
    throw new FeedbackValidationError(`${where}.lines must be a valid 1-indexed range`);
  return [start as number, end as number];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new FeedbackValidationError(`feedback is not valid JSON: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Create `src/core/index.ts`**

```typescript
export * from "./types";
export * from "./internal";
export * from "./schema";
export * from "./diff";
export * from "./reconcile";
export * from "./context";
export * from "./review-model";
export * from "./feedback";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- feedback`
Expected: PASS — all 4 tests green.

- [ ] **Step 6: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: All test files pass (schema, diff, reconcile, context, review-model, feedback); `tsc --noEmit` exits 0 with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/feedback.ts src/core/index.ts src/core/feedback.test.ts
git commit -m "feat(core): add feedback validation/serialization and public barrel"
```

---

## Self-Review

**1. Spec coverage (this plan's slice — the core):**
- Contract types (`handoff.json` / `feedback.json`) → Task 1 (`types.ts`) + Task 6 (feedback types). ✓
- Malformed handoff → validation error → Task 1 (`parseHandoff` throws). ✓
- git diff = ground truth; parse changed lines → Task 2. ✓
- Reconciliation: Leftovers + stale detection → Task 3. ✓
- Enclosing-context display (heuristic, stack-agnostic) → Task 4. ✓
- Shared-code dedupe/collapse + partial flows + per-line kinds → Task 5. ✓
- Feedback verdicts + comments (line + intent) serialization/validation → Task 6. ✓
- Deferred by design (later plans): server/CLI blocking, browser UI, Claude integration, multi-repo, manual re-grouping. Not in this plan's scope.

**2. Placeholder scan:** No TBD/TODO; every code and test step contains complete, runnable content. ✓

**3. Type consistency:** `LineRange` used uniformly. `changedLinesByPath` (Task 2) consumed identically in Tasks 3 and 5. `reconcile`'s `ReconcileResult`/`Leftover` shapes match Task 5's usage (`l.path`, `l.ranges`). `Intent`/`Verdict` unions defined in Task 1 and enforced in Task 6. `FileReader` signature matches Task 5 test and impl. ✓
