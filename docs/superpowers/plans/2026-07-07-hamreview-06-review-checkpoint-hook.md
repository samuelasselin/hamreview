# Review Checkpoint Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Claude Code `Stop` hook in the `ham-review` plugin that fires at every turn-end and, when the repo has un-reviewed working-tree changes, forces the agent to judge whether to run the `ham-review` skill — so the review reliably triggers at genuine feature-complete checkpoints without the agent having to remember.

**Architecture:** A thin hook wrapper (`scripts/checkpoint.mjs`) does all I/O — reads the Stop-hook stdin JSON, inspects `git` at `cwd`, reads/writes a per-repo state file — and delegates every decision to a **pure, unit-tested core** (`scripts/checkpoint-core.mjs`). The wrapper **fails open** on every error (it must never trap the user). The hook is registered via `hooks/hooks.json` at the plugin root. A staging-invariant "work signature" (stored in `.git/hamreview-state.json`) ensures the same set of changes is asked about at most once and that the skill's own `git add -A` does not re-trigger it.

**Tech Stack:** Node.js ≥ 20, plain ES modules (`.mjs`), Node builtins only (`node:child_process`, `node:crypto`, `node:fs`, `node:path`), Vitest 3 for tests, git CLI.

**Spec:** `docs/superpowers/specs/2026-07-07-review-checkpoint-hook-design.md`

## Global Constraints

- **Node ≥ 20**, plain `.mjs` ES modules. **No build step** and **no `tsx`** for the hook — it runs on every turn-end and must start fast.
- **Node builtins only.** The installed plugin has **no `node_modules`** (it is a cloned git repo, never `npm install`ed), so the hook and its core must not import any third-party package.
- **Fail open, always.** Any error path — no git, not a repo, unreadable/unwritable state, malformed stdin, any exception — must **allow the stop** (exit 0, no output). Blocking on a bug would trap the user.
- **Ask at most once per working-tree state.** The signature must be **staging-invariant** so `ham-review`'s `git add -A` (skill step 1) does not change it. If the ask cannot be persisted, **allow** (do not block) — an unrecorded block re-fires forever.
- **Plugin-only files.** `scripts/` and `hooks/` ship via the plugin (the marketplace source is the repo root); they are **not** in the npm `files` list, so no `package.json` change is needed.
- **Scope:** default-on, no opt-out (v1). The hook runs in every repo; its self-guard keeps it silent on clean/already-seen states.
- **Commits:** conventional-commit messages, **no AI attribution** and no `Co-Authored-By` trailers (org policy).

---

### Task 1: Pure decision core

**Files:**
- Create: `scripts/checkpoint-core.mjs`
- Test: `scripts/checkpoint-core.test.mjs`

**Interfaces:**
- Consumes: nothing (Node builtin `node:crypto` only).
- Produces (all pure, no I/O):
  - `parseStatus(porcelainZ: string) => {status: string, path: string}[]` — parses `git status --porcelain=v1 -z` output; consumes and drops the origin path of rename/copy records.
  - `computeSignature(pairs: {path: string, contentSha: string}[]) => string` — order-independent hex sha256 over `(path, contentSha)`; **does not** use git status codes, so it is staging-invariant.
  - `decide(signature: string, lastAskedSignature: string) => boolean` — `true` = ask/block.
  - `summarizeStatus(entries: {status: string, path: string}[]) => string` — up to 3 files, then `(+N more)`.
  - `buildReason(summary: string) => string` — the instruction injected into the agent.

- [ ] **Step 1: Write the failing tests**

Create `scripts/checkpoint-core.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import { parseStatus, computeSignature, decide, summarizeStatus, buildReason } from "./checkpoint-core.mjs";

describe("parseStatus", () => {
  it("returns [] for empty input", () => {
    expect(parseStatus("")).toEqual([]);
  });

  it("parses modified, added and untracked entries", () => {
    const z = "M  a.txt\0?? b.txt\0 M c.txt\0";
    expect(parseStatus(z)).toEqual([
      { status: "M ", path: "a.txt" },
      { status: "??", path: "b.txt" },
      { status: " M", path: "c.txt" },
    ]);
  });

  it("consumes the origin path of a rename record", () => {
    const z = "R  new.txt\0old.txt\0M  other.txt\0";
    expect(parseStatus(z)).toEqual([
      { status: "R ", path: "new.txt" },
      { status: "M ", path: "other.txt" },
    ]);
  });
});

describe("computeSignature", () => {
  it("is deterministic and independent of input order", () => {
    const a = [{ path: "x", contentSha: "1" }, { path: "y", contentSha: "2" }];
    const b = [{ path: "y", contentSha: "2" }, { path: "x", contentSha: "1" }];
    expect(computeSignature(a)).toBe(computeSignature(b));
  });

  it("changes when a file's content sha changes", () => {
    expect(computeSignature([{ path: "x", contentSha: "1" }]))
      .not.toBe(computeSignature([{ path: "x", contentSha: "2" }]));
  });
});

describe("decide", () => {
  it("does not ask when the tree is clean", () => {
    expect(decide("", "")).toBe(false);
  });
  it("asks for a new, unseen signature", () => {
    expect(decide("abc", "")).toBe(true);
    expect(decide("abc", "def")).toBe(true);
  });
  it("does not re-ask the already-asked signature", () => {
    expect(decide("abc", "abc")).toBe(false);
  });
});

describe("summarizeStatus", () => {
  it("lists up to three files", () => {
    expect(summarizeStatus([{ status: "M ", path: "a" }, { status: "??", path: "b" }]))
      .toBe("M a, ?? b");
  });
  it("collapses the rest into a count", () => {
    const entries = ["a", "b", "c", "d", "e"].map((p) => ({ status: "M ", path: p }));
    expect(summarizeStatus(entries)).toBe("M a, M b, M c (+2 more)");
  });
});

describe("buildReason", () => {
  it("embeds the summary and both branches", () => {
    const r = buildReason("M a.txt");
    expect(r).toContain("ham-review checkpoint");
    expect(r).toContain("M a.txt");
    expect(r).toContain("If YES");
    expect(r).toContain("If NO");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/checkpoint-core.test.mjs`
Expected: FAIL — `Failed to resolve import "./checkpoint-core.mjs"` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/checkpoint-core.mjs`:

```js
import { createHash } from "node:crypto";

/**
 * Parse `git status --porcelain=v1 -z --untracked-files=all` output.
 * With -z, records are NUL-terminated and paths are never quoted. Rename/copy
 * records (X in {R,C}) carry an extra NUL-separated origin path, which we
 * consume and ignore (we key off the current/new path).
 */
export function parseStatus(porcelainZ) {
  const tokens = porcelainZ.split("\0").filter((t) => t.length > 0);
  const entries = [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i].slice(0, 2);
    const path = tokens[i].slice(3);
    entries.push({ status, path });
    if (status[0] === "R" || status[0] === "C") i++; // skip the origin path
  }
  return entries;
}

/** Deterministic, order-independent signature of the working-tree changes. */
export function computeSignature(pairs) {
  const body = [...pairs]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((p) => `${p.path}\0${p.contentSha}`)
    .join("\n");
  return createHash("sha256").update(body).digest("hex");
}

/** Should the hook ask (block) for this state? */
export function decide(signature, lastAskedSignature) {
  if (!signature) return false;
  return signature !== lastAskedSignature;
}

/** Short human summary of changed files: up to 3, then "(+N more)". */
export function summarizeStatus(entries) {
  const shown = entries.slice(0, 3).map((e) => `${e.status.trim() || "?"} ${e.path}`);
  const extra = entries.length - shown.length;
  return shown.join(", ") + (extra > 0 ? ` (+${extra} more)` : "");
}

/** The instruction injected into the agent's context on a checkpoint. */
export function buildReason(summary) {
  return [
    "⚠ ham-review checkpoint — you're ending your turn with uncommitted, un-reviewed changes:",
    `  ${summary}`,
    "",
    "Before you stop, decide whether these form a COMPLETE, reviewable unit — a coherent",
    "feature or data-flow (e.g. an endpoint / use-case / component with its supporting",
    "layers), not a half-written change, a trivial tweak, or pure config/docs.",
    "  • If YES → invoke the ham-review skill now.",
    "  • If NO  → say in one line why it's not review-ready yet, then stop.",
    "",
    "You will not be asked again about this exact set of changes.",
  ].join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/checkpoint-core.test.mjs`
Expected: PASS — all suites green (parseStatus, computeSignature, decide, summarizeStatus, buildReason).

- [ ] **Step 5: Commit**

```bash
git add scripts/checkpoint-core.mjs scripts/checkpoint-core.test.mjs
git commit -m "feat(hook): pure decision core for the review checkpoint"
```

---

### Task 2: The Stop-hook wrapper

**Files:**
- Create: `scripts/checkpoint.mjs`
- Test: `scripts/checkpoint.test.mjs`

**Interfaces:**
- Consumes: `parseStatus`, `computeSignature`, `decide`, `summarizeStatus`, `buildReason` from `./checkpoint-core.mjs` (Task 1).
- Produces: an executable hook. Contract — reads a JSON object with a `cwd` field on **stdin**; on stdout either **nothing** (allow the stop) or `{"decision":"block","reason":…,"additionalContext":…}` (ask); **always exits 0**. Reads/writes `<git-dir>/hamreview-state.json` (`{ "lastAskedSignature": string }`).

- [ ] **Step 1: Write the failing integration tests**

Create `scripts/checkpoint.test.mjs`:

```js
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "checkpoint.mjs");

function git(repo, args) {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args]);
}

/** Run the hook with a Stop payload for `cwd`; returns { stdout, status }. */
function runHook(cwd) {
  try {
    const stdout = execFileSync("node", [HOOK], {
      input: JSON.stringify({ hook_event_name: "Stop", cwd }),
      encoding: "utf8",
    });
    return { stdout, status: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

let repo;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "hamreview-hook-"));
  git(repo, ["init", "-q"]);
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "init"]);
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("checkpoint hook", () => {
  it("allows the stop on a clean tree (no output, exit 0)", () => {
    const { stdout, status } = runHook(repo);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });

  it("blocks with a review prompt when there is un-reviewed work", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const { stdout, status } = runHook(repo);
    expect(status).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("ham-review checkpoint");
  });

  it("does not re-ask about the same working-tree state", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(JSON.parse(runHook(repo).stdout).decision).toBe("block");
    expect(runHook(repo).stdout).toBe(""); // same state, next turn → allow
  });

  it("is staging-invariant: `git add -A` does not re-trigger", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    writeFileSync(join(repo, "b.txt"), "new\n");
    expect(JSON.parse(runHook(repo).stdout).decision).toBe("block");
    git(repo, ["add", "-A"]);
    expect(runHook(repo).stdout).toBe(""); // same signature → allow
  });

  it("re-asks after new edits produce a new state", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(JSON.parse(runHook(repo).stdout).decision).toBe("block");
    writeFileSync(join(repo, "a.txt"), "one\ntwo\nthree\n");
    expect(JSON.parse(runHook(repo).stdout).decision).toBe("block");
  });

  it("allows the stop when cwd is not a git repo", () => {
    const notRepo = mkdtempSync(join(tmpdir(), "hamreview-nonrepo-"));
    try {
      const { stdout, status } = runHook(notRepo);
      expect(status).toBe(0);
      expect(stdout).toBe("");
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run scripts/checkpoint.test.mjs`
Expected: FAIL — spawning `node scripts/checkpoint.mjs` errors because the file does not exist, so `runHook` throws and assertions fail.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/checkpoint.mjs`:

```js
#!/usr/bin/env node
// HamReview review-checkpoint Stop hook.
// Fires at every turn-end. If the repo at `cwd` has an un-reviewed working-tree
// change, it blocks the stop and injects a prompt forcing the agent to decide
// whether to run the ham-review skill. FAILS OPEN on every error path — it must
// never trap the user. Uses only Node builtins (the installed plugin has no
// node_modules). Spec: docs/superpowers/specs/2026-07-07-review-checkpoint-hook-design.md
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseStatus, computeSignature, decide, summarizeStatus, buildReason } from "./checkpoint-core.mjs";

const ADDITIONAL_CONTEXT =
  "Injected by the hamreview plugin Stop hook; it fires once per distinct working-tree state.";

/** Print nothing and exit 0 — the "allow the stop" decision. */
function allow() {
  process.exit(0);
}

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function shaOfWorkingFile(cwd, path) {
  try {
    return createHash("sha256").update(readFileSync(join(cwd, path))).digest("hex");
  } catch {
    return " deleted"; // absent in the working tree (deletion)
  }
}

function main() {
  let cwd;
  try {
    cwd = JSON.parse(readFileSync(0, "utf8")).cwd;
  } catch {
    return allow();
  }
  if (!cwd) return allow();

  let gitDir;
  try {
    gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]).trim();
  } catch {
    return allow(); // not a repo, or git missing
  }

  let entries;
  try {
    entries = parseStatus(git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  } catch {
    return allow();
  }
  if (entries.length === 0) return allow();

  const signature = computeSignature(
    entries.map((e) => ({ path: e.path, contentSha: shaOfWorkingFile(cwd, e.path) })),
  );

  const statePath = join(gitDir, "hamreview-state.json");
  let lastAsked = "";
  try {
    lastAsked = JSON.parse(readFileSync(statePath, "utf8")).lastAskedSignature ?? "";
  } catch {
    lastAsked = "";
  }

  if (!decide(signature, lastAsked)) return allow();

  // Persist BEFORE asking. If the ask can't be recorded, allow — an unrecorded
  // block would re-fire every turn (an unbreakable loop).
  try {
    writeFileSync(statePath, JSON.stringify({ lastAskedSignature: signature }));
  } catch {
    return allow();
  }

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: buildReason(summarizeStatus(entries)),
      additionalContext: ADDITIONAL_CONTEXT,
    }),
  );
  process.exit(0);
}

try {
  main();
} catch {
  allow(); // fail open on anything unexpected
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run scripts/checkpoint.test.mjs`
Expected: PASS — all six cases green (clean→allow, dirty→block, same-state→allow, staging-invariant→allow, new-edit→block, non-repo→allow).

- [ ] **Step 5: Run the full suite and the core typecheck (no regressions)**

Run: `npm test`
Expected: PASS — the existing suites plus the two new hook suites.
Run: `npm run typecheck:core`
Expected: PASS — `src/core` stays Node/DOM-free (the hook lives in `scripts/`, outside `tsconfig.core.json`'s `include`, so it is untouched).

- [ ] **Step 6: Commit**

```bash
git add scripts/checkpoint.mjs scripts/checkpoint.test.mjs
git commit -m "feat(hook): review-checkpoint Stop hook wrapper (fail-open)"
```

---

### Task 3: Register the Stop hook in the plugin

**Files:**
- Create: `hooks/hooks.json`

**Interfaces:**
- Consumes: `scripts/checkpoint.mjs` (Task 2), resolved at runtime via `${CLAUDE_PLUGIN_ROOT}`.
- Produces: the plugin's `Stop` hook registration (auto-discovered by Claude Code at the plugin root).

- [ ] **Step 1: Create the hook registration**

Create `hooks/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/checkpoint.mjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the registration is valid and points at a real script**

Run:
```bash
node -e "const h=JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); if(!h.hooks?.Stop?.[0]?.hooks?.[0]?.command) throw new Error('bad Stop hook shape'); require('fs').accessSync('scripts/checkpoint.mjs'); console.log('ok');"
```
Expected: prints `ok` (valid JSON, correct Stop-hook shape, and `scripts/checkpoint.mjs` exists).

- [ ] **Step 3: Manual end-to-end verification (human step — cannot be asserted in CI)**

In a scratch git repo with the plugin installed: make a feature-shaped change and end a turn → the agent is prompted by the checkpoint and runs `ham-review`. Repeat the turn with no new edits → no re-prompt. Make a trivial/docs-only change → the agent is prompted but legitimately declines. Clean repo → silent. (If the hook does not fire, fall back to declaring the same `hooks` object inline under a `"hooks"` key in `.claude-plugin/plugin.json`.)

- [ ] **Step 4: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(plugin): register the review-checkpoint Stop hook"
```

---

### Task 4: Sharpen the `ham-review` skill description

**Files:**
- Modify: `skills/ham-review/SKILL.md:3` (the `description` frontmatter field)

**Interfaces:**
- Consumes: nothing.
- Produces: a concrete, symptom-based trigger description aligned with the hook's prompt.

- [ ] **Step 1: Replace the description line**

In `skills/ham-review/SKILL.md`, replace the frontmatter `description:` (line 3):

Old:
```yaml
description: Use at a checkpoint after writing a coherent slice of a feature (or when the human asks) to review it by data-flow slices — group your uncommitted changes into flows, open a blocking browser review for the human, and act on their line-level feedback before continuing.
```

New:
```yaml
description: Use right after implementing a coherent feature or data-flow — a new or changed endpoint, use-case, component, or migration and its supporting layers — before committing or starting the next task; or whenever the human asks. Reviews the change WITH the human, grouped by the flow of data.
```

(Rationale: concrete triggering symptoms, no step-by-step workflow summary — per superpowers:writing-skills, a workflow summary in the description makes agents follow the description instead of reading the skill body.)

- [ ] **Step 2: Verify the edit**

Run: `grep -n "before committing or starting the next task" skills/ham-review/SKILL.md`
Expected: one match on line 3.

- [ ] **Step 3: Commit**

```bash
git add skills/ham-review/SKILL.md
git commit -m "docs(skill): sharpen the ham-review trigger description"
```

---

## Self-Review

**1. Spec coverage:**
- Stop hook forcing the agent's judgment (spec §1) → Tasks 2 + 3, prompt text in Task 1 `buildReason`. ✓
- Staging-invariant work signature + `.git/hamreview-state.json` anti-nag (spec §2) → Task 1 `computeSignature`/`decide`, Task 2 wrapper + the "staging-invariant" and "same-state" tests. ✓
- Sharpened `SKILL.md` description (spec §3) → Task 4. ✓
- Default-on, no opt-out (spec §4) → no marker/config anywhere; `hooks.json` `matcher: "*"`. ✓
- Pure core + thin wrapper (spec Architecture) → Tasks 1 and 2. ✓
- Fail-open on every error (spec Error handling) → Task 2 wrapper (try/catch on stdin, rev-parse, status, state write; top-level catch) + non-repo test. ✓
- Testing (spec) → Task 1 pure unit tests; Task 2 integration tests incl. staging-invariance and non-repo. ✓
- `npx` auto-mode block → explicitly a spec non-goal / risk; **not** in this plan, surfaced in the closing note below. ✓ (no task, by design)

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows complete code; every run step shows the command and expected output. ✓

**3. Type consistency:** `parseStatus`→`{status,path}[]` is consumed by `summarizeStatus` and (via `.map`) by `computeSignature`'s `{path,contentSha}[]`; `computeSignature`/`decide` string signatures match between core (Task 1) and wrapper (Task 2); the wrapper imports exactly the five names Task 1 exports. State shape `{lastAskedSignature}` is written and read identically. ✓

---

## Not in this plan (tracked separately)

The **execution gap**: even when triggered, the observed workflow had `npx -y hamreview` **denied by the auto-mode classifier**, so the review never opened. This plan closes the *trigger* gap only. Closing the loop needs a separate change (e.g. a documented permission allowlist entry for the review command, or invoking the CLI by a path auto-mode trusts). Recommend a follow-up spec/plan once this lands.
