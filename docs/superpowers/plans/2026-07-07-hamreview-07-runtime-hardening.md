# Runtime Hardening Implementation Plan (Plan 07)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close audit findings #1–#10 in the HamReview runtime: contain hostile `handoff.json` paths, token-protect the API, kill the stale-feedback bug, survive signals and headless environments, surface real errors, cap runaway context, make Leftovers reviewable, and persist review state across refreshes.

**Architecture:** Security checks split by layer — a lexical path check in the framework-free core (`src/core/schema.ts`) plus a `resolve()`-based containment guard in the server reader (`src/server/git.ts`). A per-run token travels CLI → spawn env → API routes → UI header. The done-signal file gains content (`"submitted"` / `"aborted"`) so the CLI never infers success from a stale `feedback.json`. UI durability = pure serialize/deserialize helpers in `app/lib/review-state.ts` + `sessionStorage` wiring in `app/page.tsx`. Leftovers become a first-class reviewable panel gated into Send.

**Tech Stack:** TypeScript, Next.js 15 App Router (routes in `app/api/*/route.ts`), Vitest 3 (temp-git-repo integration style per `src/server/git.test.ts`), Node builtins.

**Spec:** `docs/superpowers/specs/2026-07-07-production-hardening-design.md` (§A–§E)

## Global Constraints

- **Relative imports only** (vitest has no alias resolution).
- **`src/core` stays framework- and Node-free** (`npm run typecheck:core` must stay green) — no `node:*` imports in core; lexical string logic only.
- **Fail toward safety:** containment failures read as `[]`; token failures are 403; a done-signal that isn't `"submitted"` is a failed review (exit non-zero).
- **Commits:** conventional messages, no AI attribution, no `Co-Authored-By` trailers.
- **Never `git add -A`.** `package.json` carries the user's intentional uncommitted `1.0.1` version bump — do not stage it except where Task 4 explicitly says so.
- **Never run the blocking CLI/browser flow in an automated agent.** Verify the server headlessly (route tests / curl), per repo practice.
- Test env: `export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"`; commit with `git -c commit.gpgsign=false commit …`.
- Full suite (`npm test`), `npm run typecheck`, `npm run typecheck:core` must be green at every task's end.

---

### Task 1: Path containment (audit #1)

**Files:**
- Modify: `src/core/schema.ts` (add `assertSafePath`, call it in `parseStep`)
- Modify: `src/server/git.ts:15-23` (`makeFileReader` containment)
- Test: `src/core/schema.test.ts` (append), `src/server/git.test.ts` (append)

**Interfaces:**
- Consumes: existing `parseHandoff` / `HandoffValidationError` (schema.ts), `makeFileReader(root)` (git.ts).
- Produces: `parseHandoff` now throws `HandoffValidationError` on absolute or `.`/`..` step paths; `makeFileReader(root)(path)` returns `[]` for any path resolving outside `root`. No signature changes.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/schema.test.ts` (it already imports `parseHandoff`; add `HandoffValidationError` to the import if missing):

```ts
describe("step path safety", () => {
  const handoffWith = (path: string) => ({
    version: 1,
    root: "/r",
    base: "working-tree",
    flows: [{ id: "f", title: "F", steps: [{ path, ranges: [[1, 1]], role: "x" }] }],
  });

  it("rejects an absolute path", () => {
    expect(() => parseHandoff(handoffWith("/etc/passwd"))).toThrow(HandoffValidationError);
    expect(() => parseHandoff(handoffWith("/etc/passwd"))).toThrow(/relative to root/);
  });

  it("rejects a Windows-style absolute path", () => {
    expect(() => parseHandoff(handoffWith("C:\\secrets.txt"))).toThrow(/relative to root/);
  });

  it("rejects .. traversal segments", () => {
    expect(() => parseHandoff(handoffWith("../../etc/passwd"))).toThrow(/"\." or "\.\." segments/);
  });

  it("rejects . segments", () => {
    expect(() => parseHandoff(handoffWith("./a.txt"))).toThrow(/"\." or "\.\." segments/);
  });

  it("accepts a normal nested relative path", () => {
    expect(() => parseHandoff(handoffWith("src/app/x.ts"))).not.toThrow();
  });
});
```

Append to `src/server/git.test.ts` (inside the existing file, after the `makeFileReader` describe — `repo` is already set up):

```ts
describe("makeFileReader containment (defense in depth)", () => {
  it("refuses to read outside root even if validation is bypassed", () => {
    expect(makeFileReader(repo)("../outside.txt")).toEqual([]);
    expect(makeFileReader(repo)("/etc/passwd")).toEqual([]);
    expect(makeFileReader(repo)("a/../../outside.txt")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/core/schema.test.ts src/server/git.test.ts`
Expected: FAIL — the safety cases throw nothing / the reader returns real content or `[]` for the wrong reason (no containment yet; `/etc/passwd` case will read the actual file on this machine and fail `toEqual([])`).

- [ ] **Step 3: Implement**

In `src/core/schema.ts`, inside `parseStep`, immediately after the `path` string validation (line 62's check), add the call, and add the helper at the bottom of the file (before `safeJson`):

```ts
  if (typeof s.path !== "string" || s.path.length === 0)
    throw new HandoffValidationError(`${where}.path must be a non-empty string`);
  assertSafePath(s.path, where);
```

```ts
/**
 * Lexical path safety (core stays Node-free, so no path.resolve here):
 * a step path must be relative and free of "." / ".." segments. The server
 * layer re-checks containment with resolve() as defense in depth.
 */
function assertSafePath(path: string, where: string): void {
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path))
    throw new HandoffValidationError(`${where}.path must be relative to root, not absolute`);
  const segments = path.split(/[/\\]/);
  if (segments.some((seg) => seg === "." || seg === ".."))
    throw new HandoffValidationError(`${where}.path must not contain "." or ".." segments`);
}
```

Replace `makeFileReader` in `src/server/git.ts` (change the `node:path` import to include `resolve` and `sep`):

```ts
import { join, resolve, sep } from "node:path";
```

```ts
/**
 * A core `FileReader` bound to `root`; missing files read as [].
 * Containment: any path resolving outside `root` also reads as [] — the
 * schema already rejects such paths, this guards against bypasses.
 */
export function makeFileReader(root: string): FileReader {
  const base = resolve(root);
  return (path: string): string[] => {
    const full = resolve(base, path);
    if (full !== base && !full.startsWith(base + sep)) return [];
    try {
      return readFileSync(full, "utf8").split("\n");
    } catch {
      return [];
    }
  };
}
```

(`join` remains used by nothing after this — remove it from the import if so.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/schema.test.ts src/server/git.test.ts`
Expected: PASS.
Then: `npm test && npm run typecheck && npm run typecheck:core`
Expected: all green (core has no Node imports — the lexical check keeps `typecheck:core` clean).

- [ ] **Step 5: Commit**

```bash
git add src/core/schema.ts src/core/schema.test.ts src/server/git.ts src/server/git.test.ts
git -c commit.gpgsign=false commit -m "fix(security): contain handoff step paths to the repo root"
```

---

### Task 2: Per-run API token (audit #2)

**Files:**
- Modify: `src/server/standalone.ts` (spawn env), `src/server/context.ts` (env + `tokenOk`), `app/api/review/route.ts`, `app/api/feedback/route.ts`, `app/api/abort/route.ts`, `src/cli.ts`, `app/page.tsx`
- Test: `src/server/context.test.ts`, `src/server/routes.test.ts`, `src/server/abort.test.ts`, `src/server/standalone.test.ts` (update existing cases + add 403 cases)

**Interfaces:**
- Consumes: `readEnv` / `ServerEnv` (context.ts), `serverSpawnSpec(opts)` (standalone.ts).
- Produces:
  - `ServerEnv` gains `token: string`; `readEnv` requires `HAMREVIEW_TOKEN`.
  - `tokenOk(env: ServerEnv, provided: string | null): boolean` — constant-time compare, exported from `src/server/context.ts`.
  - `serverSpawnSpec` opts gain `token: string`; env gains `HAMREVIEW_TOKEN`.
  - All three routes 403 (`{ error: "invalid or missing review token" }`) without a matching `x-hamreview-token` header. `GET` and abort `POST` gain a `req: Request` parameter.

- [ ] **Step 1: Write the failing tests**

In `src/server/context.test.ts`: every constructed `env` object and the `process.env` setup must gain a token. Add to `beforeAll`: nothing (this file builds env objects inline) — instead change each `const env = { handoffPath, feedbackOut, donePath }` to `const env = { handoffPath, feedbackOut, donePath, token: "tkn" }`. Append:

```ts
describe("tokenOk", () => {
  const env = { handoffPath: "h", feedbackOut: "f", donePath: "d", token: "secret42" };
  it("accepts the exact token", () => {
    expect(tokenOk(env, "secret42")).toBe(true);
  });
  it("rejects a wrong, empty, or missing token", () => {
    expect(tokenOk(env, "nope")).toBe(false);
    expect(tokenOk(env, "")).toBe(false);
    expect(tokenOk(env, null)).toBe(false);
  });
});
```

(Import `tokenOk` from `./context`.)

In `src/server/routes.test.ts`: add to `beforeAll`: `process.env.HAMREVIEW_TOKEN = "tkn";` (and `delete` it in `afterAll`). Add the header to the existing requests — `GET` becomes `GET(new Request("http://localhost/api/review", { headers: { "x-hamreview-token": "tkn" } }))`, and the feedback POST requests gain `headers: { "x-hamreview-token": "tkn" }`. Append:

```ts
describe("token protection", () => {
  it("rejects /api/review without the token", async () => {
    const res = await GET(new Request("http://localhost/api/review"));
    expect(res.status).toBe(403);
  });
  it("rejects /api/feedback with a wrong token", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "x-hamreview-token": "wrong" },
      body: JSON.stringify({ version: 1, submittedAt: "t", flows: [], comments: [] }),
    });
    expect((await POST(req)).status).toBe(403);
  });
});
```

In `src/server/abort.test.ts`: add `process.env.HAMREVIEW_TOKEN = "tkn"` to `beforeAll` (+ cleanup); existing `POST()` call becomes `POST(new Request("http://localhost/api/abort", { method: "POST", headers: { "x-hamreview-token": "tkn" } }))`. Append a 403 case without the header.

In `src/server/standalone.test.ts`: the existing `serverSpawnSpec` call sites gain `token: "tkn"`; add an assertion `expect(spec.env.HAMREVIEW_TOKEN).toBe("tkn")`.

Also grep for other `ServerEnv`/`HAMREVIEW_` constructors and update them the same way: `grep -rn "HAMREVIEW_\|donePath" src app --include="*.test.ts"` (known extras: `src/server/roundtrip.test.ts`, `src/server/contract-roundtrip.test.ts`).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server`
Expected: FAIL — `tokenOk` not exported, `token` missing from `ServerEnv`, routes don't 403.

- [ ] **Step 3: Implement**

`src/server/context.ts` — extend the interface, `readEnv`, and add `tokenOk`:

```ts
import { timingSafeEqual } from "node:crypto";

export interface ServerEnv {
  handoffPath: string;
  feedbackOut: string;
  donePath: string;
  token: string;
}

export function readEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const handoffPath = required(env, "HAMREVIEW_HANDOFF");
  const feedbackOut = required(env, "HAMREVIEW_FEEDBACK_OUT");
  const donePath = required(env, "HAMREVIEW_DONE");
  const token = required(env, "HAMREVIEW_TOKEN");
  return { handoffPath, feedbackOut, donePath, token };
}

/** Constant-time check of the per-run review token. */
export function tokenOk(env: ServerEnv, provided: string | null): boolean {
  if (provided === null || provided.length === 0) return false;
  const a = Buffer.from(env.token);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

`src/server/standalone.ts` — opts gain `token: string;` and the env block gains `HAMREVIEW_TOKEN: opts.token,`.

All three routes get the same guard at the top (shown for review; mirror in feedback and abort, both of which now take `req: Request`):

```ts
import { NextResponse } from "next/server";
import { buildModelFor, readEnv, tokenOk } from "../../../src/server/context";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = readEnv(process.env);
  if (!tokenOk(env, req.headers.get("x-hamreview-token")))
    return NextResponse.json({ error: "invalid or missing review token" }, { status: 403 });
  const model = buildModelFor(env.handoffPath);
  return NextResponse.json({ model });
}
```

`src/cli.ts` — generate and thread the token; the browser URL carries it as a query param:

```ts
import { randomBytes } from "node:crypto";
// …
const token = randomBytes(16).toString("hex");
const spec = serverSpawnSpec({
  execPath: process.execPath,
  packageRoot,
  port,
  handoffPath,
  feedbackOut,
  donePath,
  token,
  baseEnv: process.env,
});
// … readiness probe stays on the bare URL (the page itself is not token-gated):
const url = `http://127.0.0.1:${port}`;
const reviewUrl = `${url}/?token=${token}`;
// … print and open reviewUrl instead of url:
console.log(`HamReview open at ${reviewUrl} — review, then submit in the browser (Ctrl-C to abort).`);
await open(reviewUrl);
```

`app/page.tsx` — read the token once on mount and send it on every call:

```ts
import { useEffect, useRef, useState } from "react";
// …
  const tokenRef = useRef("");

  useEffect(() => {
    tokenRef.current = new URLSearchParams(window.location.search).get("token") ?? "";
    fetch("/api/review", { headers: { "x-hamreview-token": tokenRef.current } })
      .then((r) => {
        if (!r.ok) throw new Error(`review request failed (${r.status})`);
        return r.json();
      })
      .then((d) => setModel(d.model))
      .catch(() => setError("Failed to load the review."));
  }, []);
```

and in `send()` / `abort()` add the header:

```ts
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "x-hamreview-token": tokenRef.current },
        body: JSON.stringify(toFeedback(state, new Date().toISOString())),
      });
```

```ts
      const res = await fetch("/api/abort", { method: "POST", headers: { "x-hamreview-token": tokenRef.current } });
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/server` then `npm test && npm run typecheck && npm run typecheck:core`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/server/context.ts src/server/context.test.ts src/server/standalone.ts src/server/standalone.test.ts \
  app/api/review/route.ts app/api/feedback/route.ts app/api/abort/route.ts \
  src/server/routes.test.ts src/server/abort.test.ts src/server/roundtrip.test.ts src/server/contract-roundtrip.test.ts \
  src/cli.ts app/page.tsx
git -c commit.gpgsign=false commit -m "fix(security): per-run token required on every API route"
```

---

### Task 3: Truthful done-signal + no stale feedback (audit #3)

**Files:**
- Modify: `src/server/context.ts:37-46` (`submitFeedback` / `submitAbort` write content), `src/cli.ts` (clear stale file; check content)
- Test: `src/server/context.test.ts`, `src/server/abort.test.ts`, `src/server/routes.test.ts` (content assertions)

**Interfaces:**
- Consumes: `waitForFile` (unchanged), `ServerEnv` from Task 2.
- Produces: the done file's **content** is the outcome — `"submitted"` or `"aborted"`. The CLI treats anything except `"submitted"` as not-submitted.

- [ ] **Step 1: Write the failing tests**

`src/server/context.test.ts` — in the `submitFeedback` test add:

```ts
    expect(readFileSync(donePath, "utf8")).toBe("submitted");
```

`src/server/abort.test.ts` — in the abort test add (import `readFileSync`):

```ts
    expect(readFileSync(process.env.HAMREVIEW_DONE as string, "utf8")).toBe("aborted");
```

`src/server/routes.test.ts` — in the feedback-ok test add the same `"submitted"` content assertion.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server/context.test.ts src/server/abort.test.ts src/server/routes.test.ts`
Expected: FAIL — the done file is currently empty (`""`).

- [ ] **Step 3: Implement**

`src/server/context.ts`:

```ts
export function submitFeedback(env: ServerEnv, body: unknown): Feedback {
  const feedback = parseFeedback(body);
  writeFileSync(env.feedbackOut, serializeFeedback(feedback));
  writeFileSync(env.donePath, "submitted");
  return feedback;
}

export function submitAbort(env: ServerEnv): void {
  writeFileSync(env.donePath, "aborted");
}
```

`src/cli.ts` — right after `const feedbackOut = …`, clear any stale file; and success requires the `"submitted"` content:

```ts
  const feedbackOut = join(process.cwd(), "feedback.json");
  // A leftover feedback.json from a previous run must never be reported as
  // this run's result (e.g. abort-after-prior-success).
  rmSync(feedbackOut, { force: true });
```

```ts
    const done = await waitForFile(donePath, 60 * 60 * 1000); // block up to 1h
    const outcome = done ? readDoneOutcome(donePath) : "";
    if (outcome === "submitted" && existsSync(feedbackOut)) {
      console.log(`feedback written to ${feedbackOut}`);
      process.exit(0);
    }
    console.error("review was not submitted" + (outcome === "aborted" ? " (aborted in the browser)" : " (browser closed?)"));
    process.exit(1);
```

with, at module level:

```ts
function readDoneOutcome(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/server` then `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/server/context.ts src/server/context.test.ts src/server/abort.test.ts src/server/routes.test.ts src/cli.ts
git -c commit.gpgsign=false commit -m "fix(cli): never report stale feedback; done-signal carries the outcome"
```

---

### Task 4: Signals + crash-proof browser opener (audit #6, #8)

**Files:**
- Create: `src/server/browser.ts`
- Modify: `src/cli.ts` (signal handlers; use `openBrowser`; drop `open`), `package.json` (remove the `open` dependency — see the commit note)
- Test: `src/server/browser.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `openBrowser(url: string, platform?: NodeJS.Platform, spawnImpl?: typeof spawn): Promise<boolean>` — resolves `false` on any failure, never throws, never crashes the process (attaches the `error` listener before `unref`, which the `open` package does not).

- [ ] **Step 1: Write the failing tests**

Create `src/server/browser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { openBrowser } from "./browser";

function fakeSpawn(outcome: "spawn" | "error") {
  const calls: { cmd: string; args: string[] }[] = [];
  const impl = ((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = () => {};
    queueMicrotask(() => child.emit(outcome, outcome === "error" ? new Error("ENOENT") : undefined));
    return child;
  }) as unknown as typeof import("node:child_process").spawn;
  return { impl, calls };
}

describe("openBrowser", () => {
  it("resolves true when the opener spawns", async () => {
    const { impl, calls } = fakeSpawn("spawn");
    await expect(openBrowser("http://x", "darwin", impl)).resolves.toBe(true);
    expect(calls[0]).toEqual({ cmd: "open", args: ["http://x"] });
  });

  it("resolves false (does not throw) when no opener exists", async () => {
    const { impl } = fakeSpawn("error");
    await expect(openBrowser("http://x", "linux", impl)).resolves.toBe(false);
  });

  it("picks the platform-appropriate command", async () => {
    const linux = fakeSpawn("spawn");
    await openBrowser("http://x", "linux", linux.impl);
    expect(linux.calls[0].cmd).toBe("xdg-open");
    const win = fakeSpawn("spawn");
    await openBrowser("http://x", "win32", win.impl);
    expect(win.calls[0]).toEqual({ cmd: "cmd", args: ["/c", "start", "", "http://x"] });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server/browser.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/server/browser.ts`:

```ts
import { spawn } from "node:child_process";

/**
 * Best-effort browser open. Resolves false instead of ever throwing or
 * crashing: the error listener is attached BEFORE unref, unlike the `open`
 * package, whose unhandled 'error' event can take down the process in
 * headless environments.
 */
export function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
  spawnImpl: typeof spawn = spawn,
): Promise<boolean> {
  const spec =
    platform === "darwin"
      ? { cmd: "open", args: [url] }
      : platform === "win32"
        ? { cmd: "cmd", args: ["/c", "start", "", url] }
        : { cmd: "xdg-open", args: [url] };
  return new Promise((done) => {
    try {
      const child = spawnImpl(spec.cmd, spec.args, { stdio: "ignore", detached: true });
      child.once("error", () => done(false));
      child.once("spawn", () => {
        child.unref();
        done(true);
      });
    } catch {
      done(false);
    }
  });
}
```

`src/cli.ts` — replace the `open` import with `openBrowser`, generalize the signal handling, and never let a failed open kill the run:

```ts
import { openBrowser } from "./server/browser";
```

```ts
  // Any termination is a graceful abort: tear down the server + temp dir.
  const bail = (signal: string, hint = ""): void => {
    console.error(`\nreview aborted (${signal})${hint}`);
    cleanup();
    process.exit(130);
  };
  process.on("SIGINT", () => bail("SIGINT"));
  process.on("SIGTERM", () => bail("SIGTERM", " — if this was a command timeout, re-run hamreview in the background"));
  process.on("SIGHUP", () => bail("SIGHUP"));
```

```ts
    console.log(`HamReview open at ${reviewUrl} — review, then submit in the browser (Ctrl-C to abort).`);
    if (!(await openBrowser(reviewUrl))) {
      console.log("could not open a browser automatically — open the URL above manually.");
    }
```

`package.json` — remove `"open": "^10.2.0",` from `dependencies` and run `npm install` to sync the lockfile. **Commit note:** `package.json` also carries the user's intentional pending `1.0.0 → 1.0.1` version bump; committing this file records that bump too — this is disclosed and expected (say so in the commit body is NOT needed; the message below covers the dep change, the bump rides along by design).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/server/browser.test.ts` then `npm test && npm run typecheck`
Expected: all green (nothing else imported `open`).

- [ ] **Step 5: Commit**

```bash
git add src/server/browser.ts src/server/browser.test.ts src/cli.ts package.json package-lock.json
git -c commit.gpgsign=false commit -m "fix(cli): handle SIGTERM/SIGHUP; crash-proof browser opener replaces the open dep"
```

---

### Task 5: Actionable errors from /api/review (audit #7)

**Files:**
- Modify: `app/api/review/route.ts`, `app/page.tsx` (surface the real message)
- Test: `src/server/routes.test.ts` (append)

**Interfaces:**
- Consumes: `HandoffValidationError` from `../../../src/core/index`, token guard from Task 2.
- Produces: `GET /api/review` returns `{ error: string }` with 400 (validation) / 500 (anything else) instead of an empty 500; the UI shows that string.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/routes.test.ts`:

```ts
describe("GET /api/review error paths", () => {
  it("returns 500 + an actionable error for a nonexistent root", async () => {
    const bad = join(repo, "handoff-badroot.json");
    writeFileSync(
      bad,
      JSON.stringify({
        version: 1,
        root: join(repo, "does-not-exist"),
        base: "working-tree",
        flows: [{ id: "f", title: "F", steps: [{ path: "a.txt", ranges: [[1, 1]], role: "x" }] }],
      }),
    );
    const prev = process.env.HAMREVIEW_HANDOFF;
    process.env.HAMREVIEW_HANDOFF = bad;
    try {
      const res = await GET(new Request("http://localhost/api/review", { headers: { "x-hamreview-token": "tkn" } }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    } finally {
      process.env.HAMREVIEW_HANDOFF = prev;
    }
  });

  it("returns 400 for an invalid handoff", async () => {
    const bad = join(repo, "handoff-invalid.json");
    writeFileSync(bad, JSON.stringify({ version: 2 }));
    const prev = process.env.HAMREVIEW_HANDOFF;
    process.env.HAMREVIEW_HANDOFF = bad;
    try {
      const res = await GET(new Request("http://localhost/api/review", { headers: { "x-hamreview-token": "tkn" } }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/version/);
    } finally {
      process.env.HAMREVIEW_HANDOFF = prev;
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/server/routes.test.ts`
Expected: FAIL — the route currently throws (unhandled → empty 500 in prod; in the test the promise rejects).

- [ ] **Step 3: Implement**

`app/api/review/route.ts`:

```ts
import { NextResponse } from "next/server";
import { buildModelFor, readEnv, tokenOk } from "../../../src/server/context";
import { HandoffValidationError } from "../../../src/core/index";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = readEnv(process.env);
  if (!tokenOk(env, req.headers.get("x-hamreview-token")))
    return NextResponse.json({ error: "invalid or missing review token" }, { status: 403 });
  try {
    const model = buildModelFor(env.handoffPath);
    return NextResponse.json({ model });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = e instanceof HandoffValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

(`HandoffValidationError` must be exported from `src/core/index.ts` — check and add the export if missing.)

`app/page.tsx` — the initial fetch surfaces the server's message:

```ts
    fetch("/api/review", { headers: { "x-hamreview-token": tokenRef.current } })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body && typeof body.error === "string" ? body.error : `review request failed (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setModel(d.model))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the review."));
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/server/routes.test.ts` then `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/api/review/route.ts app/page.tsx src/server/routes.test.ts src/core/index.ts
git -c commit.gpgsign=false commit -m "fix(server): /api/review returns actionable errors; UI shows them"
```

---

### Task 6: Context cap for flat/huge files (audit #9)

**Files:**
- Modify: `src/core/context.ts` (add `enclosingContextCapped`), `src/core/review-model.ts` (use it; `StepView` gains truncation flags), `app/components/FlowStep.tsx` (truncation bars)
- Test: `src/core/context.test.ts`, `src/core/review-model.test.ts` (append)

**Interfaces:**
- Consumes: existing `enclosingContext(lines, range): LineRange`.
- Produces:
  - `CONTEXT_CAP = 200` and `enclosingContextCapped(lines, range, cap?): { range: LineRange; truncatedAbove: boolean; truncatedBelow: boolean }` exported from `src/core/context.ts`.
  - `StepView` gains `truncatedAbove: boolean; truncatedBelow: boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/context.test.ts`:

```ts
describe("enclosingContextCapped", () => {
  it("caps a flat 50k-line file to ±200 lines around the change", () => {
    const lines = Array.from({ length: 50000 }, () => "x = 1");
    const view = enclosingContextCapped(lines, [25000, 25000]);
    expect(view.range[0]).toBe(24800);
    expect(view.range[1]).toBe(25200);
    expect(view.truncatedAbove).toBe(true);
    expect(view.truncatedBelow).toBe(true);
  });

  it("does not truncate a small enclosing block", () => {
    const lines = ["function a() {", "  x", "}"];
    const view = enclosingContextCapped(lines, [2, 2]);
    expect(view.range).toEqual([1, 3]);
    expect(view.truncatedAbove).toBe(false);
    expect(view.truncatedBelow).toBe(false);
  });
});
```

Append to `src/core/review-model.test.ts` (using its existing model-building helpers/fixtures — adapt names to the file's local style):

```ts
it("exposes truncation flags on steps", () => {
  // any existing built model in this file:
  // every step must carry the flags (false for small fixtures)
  const step = model.flows[0].steps[0];
  expect(step.truncatedAbove).toBe(false);
  expect(step.truncatedBelow).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/core/context.test.ts src/core/review-model.test.ts`
Expected: FAIL — `enclosingContextCapped` does not exist; `StepView` lacks the flags.

- [ ] **Step 3: Implement**

Append to `src/core/context.ts`:

```ts
export const CONTEXT_CAP = 200;

export interface ContextView {
  range: LineRange;
  truncatedAbove: boolean;
  truncatedBelow: boolean;
}

/**
 * enclosingContext, but never more than `cap` lines beyond the changed range
 * on either side — flat/generated files (uniform indent) otherwise expand to
 * nearly the whole file (audit #9).
 */
export function enclosingContextCapped(lines: string[], range: LineRange, cap = CONTEXT_CAP): ContextView {
  const [start, end] = enclosingContext(lines, range);
  const s = Math.max(1, range[0]);
  const e = Math.min(Math.max(lines.length, 1), range[1]);
  const cappedStart = Math.max(start, s - cap);
  const cappedEnd = Math.min(end, e + cap);
  return {
    range: [cappedStart, cappedEnd],
    truncatedAbove: cappedStart > start,
    truncatedBelow: cappedEnd < end,
  };
}
```

`src/core/review-model.ts` — swap the import and the call, and carry the flags (the display loop is unchanged, it just iterates `view.range`):

```ts
import { enclosingContextCapped } from "./context";
// … in the step map:
      const span = hull(step.ranges);
      const ctx = enclosingContextCapped(lines, span);
      const display = ctx.range;
```

and add to the constructed `StepView` (and its interface):

```ts
        truncatedAbove: ctx.truncatedAbove,
        truncatedBelow: ctx.truncatedBelow,
```

`app/components/FlowStep.tsx` — inside the `!step.collapsed` block, before and after the lines map:

```tsx
          {step.truncatedAbove && (
            <div className="bg-gray-50 px-3 py-0.5 text-xs italic text-gray-500">… earlier lines hidden</div>
          )}
```

```tsx
          {step.truncatedBelow && (
            <div className="bg-gray-50 px-3 py-0.5 text-xs italic text-gray-500">… later lines hidden</div>
          )}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/core` then `npm test && npm run typecheck && npm run typecheck:core`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/context.ts src/core/context.test.ts src/core/review-model.ts src/core/review-model.test.ts app/components/FlowStep.tsx
git -c commit.gpgsign=false commit -m "fix(core): cap enclosing context at ±200 lines with truncation flags"
```

---

### Task 7: Leftovers are reviewable and gate Send (audit #10)

**Files:**
- Modify: `src/core/review-model.ts` (`LeftoverView` gains rendered lines), `app/lib/review-state.ts` (`leftoversAcked` + `canSend`), `app/components/FlowRail.tsx` (selectable Leftovers row), `app/page.tsx` (leftovers panel + gating)
- Test: `src/core/review-model.test.ts`, `app/lib/review-state.test.ts` (append)

**Interfaces:**
- Consumes: `enclosingContextCapped` (Task 6), `DisplayLine`, `CommentComposer`, `changedLinesByPath`.
- Produces:
  - `LeftoverView` becomes `{ path, ranges, lines: DisplayLine[], truncatedAbove: boolean, truncatedBelow: boolean }`.
  - `ReviewState` gains `leftoversAcked: boolean`; `setLeftoversAcked(state, acked)`; `canSend(model, state): boolean` = all flows decided AND (`leftovers.length === 0` OR acked).
  - `FlowRail` props gain `leftoversSelected: boolean` and `onSelectLeftovers: () => void`; `page.tsx`'s selection becomes `number | "leftovers"`.
  - Leftover comments use `flowId: "leftovers"` (valid per the feedback contract — any non-empty string; the skill learns this in Plan 08).

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/review-state.test.ts`:

```ts
describe("leftovers acknowledgment", () => {
  const modelWithLeftovers = {
    flows: [{ id: "f", title: "F", partial: false, steps: [] }],
    leftovers: [{ path: "x.txt", ranges: [[1, 1]], lines: [], truncatedAbove: false, truncatedBelow: false }],
  } as unknown as ReviewModel;
  const modelWithout = { flows: [{ id: "f", title: "F", partial: false, steps: [] }], leftovers: [] } as unknown as ReviewModel;

  it("blocks Send until leftovers are acknowledged", () => {
    const decided = setVerdict(emptyReviewState, "f", "approved");
    expect(canSend(modelWithLeftovers, decided)).toBe(false);
    expect(canSend(modelWithLeftovers, setLeftoversAcked(decided, true))).toBe(true);
  });

  it("does not require acknowledgment when there are no leftovers", () => {
    const decided = setVerdict(emptyReviewState, "f", "approved");
    expect(canSend(modelWithout, decided)).toBe(true);
  });

  it("still requires every flow verdict", () => {
    expect(canSend(modelWithout, emptyReviewState)).toBe(false);
  });
});
```

Append to `src/core/review-model.test.ts` (a leftover exists whenever the diff touches a file no flow claims — extend an existing fixture or add one where the working tree changes two files and the handoff claims one):

```ts
it("renders leftover lines with change highlighting", () => {
  // model built from a handoff claiming only one of two changed files
  const leftover = model.leftovers[0];
  expect(leftover.lines.length).toBeGreaterThan(0);
  expect(leftover.lines.some((l) => l.kind === "added")).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/lib/review-state.test.ts src/core/review-model.test.ts`
Expected: FAIL — `canSend`/`setLeftoversAcked` missing; `LeftoverView` has no lines.

- [ ] **Step 3: Implement**

`src/core/review-model.ts` — extend the interface and build leftover lines exactly like step lines:

```ts
export interface LeftoverView {
  path: string;
  ranges: LineRange[];
  lines: DisplayLine[];
  truncatedAbove: boolean;
  truncatedBelow: boolean;
}
```

```ts
  const leftovers: LeftoverView[] = result.leftovers.map((l: Leftover) => {
    const lines = readFile(l.path);
    const ctx = enclosingContextCapped(lines, hull(l.ranges));
    const changedForPath = changed.get(l.path) ?? new Set<number>();
    const displayLines: DisplayLine[] = [];
    for (let n = ctx.range[0]; n <= ctx.range[1]; n++) {
      displayLines.push({ number: n, text: lines[n - 1] ?? "", kind: changedForPath.has(n) ? "added" : "context" });
    }
    return { path: l.path, ranges: l.ranges, lines: displayLines, truncatedAbove: ctx.truncatedAbove, truncatedBelow: ctx.truncatedBelow };
  });
```

`app/lib/review-state.ts`:

```ts
export interface ReviewState {
  verdicts: Record<string, Verdict>;
  comments: ReviewComment[];
  leftoversAcked: boolean;
}

export const emptyReviewState: ReviewState = { verdicts: {}, comments: [], leftoversAcked: false };

export function setLeftoversAcked(state: ReviewState, acked: boolean): ReviewState {
  return { ...state, leftoversAcked: acked };
}

/** Send is allowed once every flow is decided AND leftovers (if any) are acknowledged. */
export function canSend(model: ReviewModel, state: ReviewState): boolean {
  return allFlowsDecided(model, state) && (model.leftovers.length === 0 || state.leftoversAcked);
}
```

(Existing spreads in `setVerdict`/`addComment`/`removeComment` keep working — they copy `leftoversAcked` via `...state`.)

`app/components/FlowRail.tsx` — replace the static leftovers `div` with a button and add the two props:

```tsx
export function FlowRail({
  model,
  state,
  current,
  onSelect,
  leftoversSelected,
  onSelectLeftovers,
}: {
  model: ReviewModel;
  state: ReviewState;
  current: number | "leftovers";
  onSelect: (index: number) => void;
  leftoversSelected: boolean;
  onSelectLeftovers: () => void;
}) {
```

```tsx
      {model.leftovers.length > 0 && (
        <button
          type="button"
          onClick={onSelectLeftovers}
          className={`mt-3 flex w-full items-center gap-2 rounded border-t border-gray-200 px-2 pt-2 text-left text-amber-700 ${
            leftoversSelected ? "bg-blue-100 font-semibold" : ""
          }`}
        >
          <span className={state.leftoversAcked ? "text-green-600" : "text-gray-400"}>
            {state.leftoversAcked ? "✓" : "○"}
          </span>
          ⚠ Leftovers ({model.leftovers.length})
        </button>
      )}
```

(The flow buttons' `i === current` check still works — `current` is `"leftovers"` only when no flow is selected.)

`app/page.tsx` — selection type, the panel, and gating (key hunks):

```ts
  const [current, setCurrent] = useState<number | "leftovers">(0);
```

```ts
  const decided = canSend(model, state);
  const showingLeftovers = current === "leftovers";
  const flow = showingLeftovers ? null : model.flows[current as number];
```

Rail wiring:

```tsx
      <FlowRail
        model={model}
        state={state}
        current={current}
        onSelect={setCurrent}
        leftoversSelected={showingLeftovers}
        onSelectLeftovers={() => setCurrent("leftovers")}
      />
```

Main panel: when `showingLeftovers`, render instead of the flow (reusing `FlowStep`'s visual language inline — leftover lines are read-only but commentable via `CommentComposer` with `flowId="leftovers"`); the acknowledgment button flips `setLeftoversAcked`:

```tsx
        {showingLeftovers ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold">⚠ Leftovers</h1>
              <span className="text-sm text-gray-500">changed but not claimed by any flow</span>
            </div>
            {model.leftovers.map((l) => (
              <LeftoverBlock
                key={l.path}
                leftover={l}
                comments={state.comments}
                onAddComment={(c: ReviewComment) => setState((s) => addComment(s, c))}
              />
            ))}
            <div className="mt-6 border-t border-gray-200 pt-4">
              <Button
                color={state.leftoversAcked ? "light" : "green"}
                onClick={() => setState((s) => setLeftoversAcked(s, !s.leftoversAcked))}
              >
                {state.leftoversAcked ? "✓ Leftovers reviewed (click to undo)" : "Mark leftovers as reviewed"}
              </Button>
            </div>
          </>
        ) : (
          /* existing flow rendering, using flow! */
        )}
```

Add `LeftoverBlock` as a small component in `app/components/LeftoverBlock.tsx` (same line-rendering pattern as `FlowStep` — line click opens `CommentComposer` with `flowId="leftovers"`, truncation bars from Task 6; no verdict, no collapse):

```tsx
"use client";

import { useState } from "react";
import type { LeftoverView, ReviewComment } from "../../src/core/index";
import { CommentComposer } from "./CommentComposer";

export function LeftoverBlock({
  leftover,
  comments,
  onAddComment,
}: {
  leftover: LeftoverView;
  comments: ReviewComment[];
  onAddComment: (comment: ReviewComment) => void;
}) {
  const [activeLine, setActiveLine] = useState<number | null>(null);

  return (
    <div className="mb-3 rounded border border-amber-300">
      <div className="bg-amber-50 px-3 py-1 text-sm font-semibold">{leftover.path}</div>
      <div className="text-sm">
        {leftover.truncatedAbove && (
          <div className="bg-gray-50 px-3 py-0.5 text-xs italic text-gray-500">… earlier lines hidden</div>
        )}
        {leftover.lines.map((line) => {
          const lineComments = comments.filter((c) => c.path === leftover.path && c.lines[0] === line.number);
          return (
            <div key={line.number}>
              <div
                onClick={() => setActiveLine(activeLine === line.number ? null : line.number)}
                className={`cursor-pointer px-3 font-mono ${line.kind === "added" ? "bg-green-100" : "opacity-60"} hover:bg-blue-50`}
              >
                <span className="mr-3 select-none text-gray-400">{line.number}</span>
                {line.text || " "}
              </div>
              {lineComments.map((c) => (
                <div key={`${c.lines[0]}-${c.intent}-${c.text}`} className="mx-3 border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs">
                  <b>{c.intent}</b>: {c.text}
                </div>
              ))}
              {activeLine === line.number && (
                <div className="px-3">
                  <CommentComposer
                    path={leftover.path}
                    lines={[line.number, line.number]}
                    flowId="leftovers"
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
        {leftover.truncatedBelow && (
          <div className="bg-gray-50 px-3 py-0.5 text-xs italic text-gray-500">… later lines hidden</div>
        )}
      </div>
    </div>
  );
}
```

Also in `page.tsx`: Prev/Next buttons only render when a flow is showing; the Send hint becomes:

```tsx
        {!decided && (
          <p className="mt-2 text-xs text-gray-500">
            Give every flow a verdict{model.leftovers.length > 0 ? " and mark the leftovers as reviewed" : ""} to enable Send.
          </p>
        )}
```

(`LeftoverView` must be exported from `src/core/index.ts` — add if missing.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run app/lib/review-state.test.ts src/core/review-model.test.ts` then `npm test && npm run typecheck && npm run typecheck:core && npm run build`
Expected: all green (the build catches any page/component type slip).

- [ ] **Step 5: Commit**

```bash
git add src/core/review-model.ts src/core/review-model.test.ts src/core/index.ts app/lib/review-state.ts app/lib/review-state.test.ts \
  app/components/FlowRail.tsx app/components/LeftoverBlock.tsx app/page.tsx
git -c commit.gpgsign=false commit -m "feat(review): leftovers are inspectable, commentable, and gate Send"
```

---

### Task 8: Durable review state (audit #4)

**Files:**
- Modify: `app/lib/review-state.ts` (pure serialize/deserialize), `app/page.tsx` (sessionStorage + beforeunload wiring)
- Test: `app/lib/review-state.test.ts` (append)

**Interfaces:**
- Consumes: `ReviewState` (with `leftoversAcked` from Task 7).
- Produces: `serializeState(state): string`, `deserializeState(raw: string | null): ReviewState | null` (null on anything malformed), both pure.

- [ ] **Step 1: Write the failing tests**

Append to `app/lib/review-state.test.ts`:

```ts
describe("state persistence", () => {
  it("round-trips a state", () => {
    let s = setVerdict(emptyReviewState, "f", "approved");
    s = addComment(s, { flowId: "f", path: "a.txt", lines: [2, 2], intent: "nit", text: "t" });
    s = setLeftoversAcked(s, true);
    expect(deserializeState(serializeState(s))).toEqual(s);
  });

  it("returns null for garbage, null, or wrong shapes", () => {
    expect(deserializeState(null)).toBeNull();
    expect(deserializeState("not json{")).toBeNull();
    expect(deserializeState(JSON.stringify({ verdicts: [] }))).toBeNull();
    expect(deserializeState(JSON.stringify({ verdicts: {}, comments: {} }))).toBeNull();
  });

  it("defaults a missing leftoversAcked to false", () => {
    const restored = deserializeState(JSON.stringify({ verdicts: {}, comments: [] }));
    expect(restored).toEqual({ verdicts: {}, comments: [], leftoversAcked: false });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/lib/review-state.test.ts`
Expected: FAIL — functions don't exist.

- [ ] **Step 3: Implement**

Append to `app/lib/review-state.ts`:

```ts
export function serializeState(state: ReviewState): string {
  return JSON.stringify(state);
}

/** Restore a persisted state; null for anything malformed (fresh start). */
export function deserializeState(raw: string | null): ReviewState | null {
  if (!raw) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
    const o = d as Record<string, unknown>;
    if (typeof o.verdicts !== "object" || o.verdicts === null || Array.isArray(o.verdicts)) return null;
    if (!Array.isArray(o.comments)) return null;
    return {
      verdicts: o.verdicts as Record<string, never>,
      comments: o.comments as ReviewState["comments"],
      leftoversAcked: o.leftoversAcked === true,
    } as ReviewState;
  } catch {
    return null;
  }
}
```

`app/page.tsx` — three effects (the storage key is per-run because each run gets a fresh port/origin):

```ts
const STORAGE_KEY = "hamreview-state";
```

```ts
  // Restore any in-progress state (survives refresh; new runs get a new origin).
  useEffect(() => {
    const restored = deserializeState(sessionStorage.getItem(STORAGE_KEY));
    if (restored) setState(restored);
  }, []);

  // Autosave on every change.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, serializeState(state));
    } catch {
      // storage full/disabled — degrade to in-memory only
    }
  }, [state]);

  // Warn before discarding real work (refresh itself restores via autosave).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasWork = state.comments.length > 0 || Object.keys(state.verdicts).length > 0;
      if (status === "reviewing" && hasWork) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state, status]);
```

(Plan refinement over spec §B.5 wording: the guard keys on *work existing* — comments or any verdict — rather than "undecided flows", which would warn on a fresh, untouched review.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run app/lib/review-state.test.ts` then `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add app/lib/review-state.ts app/lib/review-state.test.ts app/page.tsx
git -c commit.gpgsign=false commit -m "feat(review): persist state to sessionStorage; warn before discarding work"
```

---

## Self-Review

**1. Spec coverage (§A–§E):** §A.1→Task 1, §A.2→Task 2, §A.3→Task 3, §B.4/5→Task 8, §C.6→Task 4, §C.7→Task 4, §C.8 runtime half→Task 4 (SIGTERM hint), §D.9→Task 5, §E.10→Task 6, §E.11→Task 7. §C.8 guidance half + §F + §G are Plan 08. ✓
**2. Placeholders:** every code step carries complete code; the two review-model test snippets explicitly direct adapting fixture names to the file's local style (the implementer sees that file) — acceptable, no TBDs. ✓
**3. Type consistency:** `ServerEnv.token` (Task 2) used by Tasks 3/5's env objects; `enclosingContextCapped`/`ContextView` (Task 6) consumed by Task 7's leftovers; `leftoversAcked` (Task 7) consumed by Task 8's serializer; `reviewUrl` introduced in Task 2 and reused in Task 4's `openBrowser` call. Task order matters and is stated. ✓

**Plan-level refinements over the spec (disclosed):** Task 4 replaces the `open` dependency with an in-repo crash-proof opener (spec asked to "wrap" it; replacement is the robust form and slims the npx download); Task 4's commit records the user's pending 1.0.1 bump (disclosed in-task); Task 8 narrows the beforeunload condition to "work exists".
