# HamReview Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the tool to `hamreview` and ship it as a zero-setup install — `npx hamreview` (no clone) plus a Claude Code plugin installable from a marketplace — the Plannotator-style experience.

**Architecture:** Publish the CLI to npm under the unscoped name `hamreview` (verified free). Slim the published package with Next's `standalone` output so `npx` pulls a small tree; the CLI spawns the built `.next/standalone/server.js` with `node` instead of `next start`. Package the same repo as a Claude Code plugin **and** marketplace via `.claude-plugin/` manifests, with the skill invoking `npx -y hamreview`.

**Tech Stack:** Next.js 15 (standalone output), React 19, TypeScript, `tsx` (CLI runtime), `open`, Vitest 3, npm, Claude Code plugin manifests.

## Global Constraints

- **Name:** the tool is `hamreview` (npm package + binary + `npx hamreview`). The Claude Code plugin, skill, and slash command are `ham-review`. User-facing product name is **HamReview**.
- **npm name is unscoped and free:** `hamreview` (confirmed available at plan time). Do not scope it.
- **Node ≥ 20** (already in `engines`); keep it.
- **Runtime deps stay minimal:** only `open` and `tsx` are runtime `dependencies`; all Next/React/Flowbite/Tailwind libraries are `devDependencies` (baked into `.next/standalone` at build time).
- **No AI attribution** in any commit message, doc, or manifest (Karibew rule).
- **Secrets:** never commit credentials; a secret re-scan precedes any publish/public step (Task 7).
- **Repo:** `github.com/samuelasselin/flowreview` today; manifests target `samuelasselin/hamreview` (repo rename happens in the author-gated Task 7; GitHub redirects the old slug).
- **Keep `tsx` at runtime** (non-goal to compile the CLI away). **Keep the single-plugin marketplace** (non-goal: multi-plugin).
- **Historical docs are archival:** leave `docs/superpowers/specs/*` and `docs/superpowers/plans/2026-07-02*/03*` untouched (they record the `flowreview` era); the rename verification greps exclude `docs/`.

---

## File Structure

**Renamed / moved:**
- `bin/flowreview.mjs` → `bin/hamreview.mjs` (bin launcher; runs `src/cli.ts` via tsx)
- `integrations/claude-code/skills/flow-review/SKILL.md` → `skills/ham-review/SKILL.md`
- `integrations/claude-code/commands/flow-review.md` → `commands/ham-review.md`
- `integrations/` directory removed once empty

**Created:**
- `src/server/standalone.ts` — pure helpers: `standaloneServerPath()`, `serverSpawnSpec()` (makes the CLI's server spawn unit-testable)
- `src/server/standalone.test.ts` — tests for the above
- `scripts/prepare-standalone.mjs` — copies `.next/static` into `.next/standalone/.next/static` after `next build`
- `.claude-plugin/plugin.json` — plugin `ham-review`
- `.claude-plugin/marketplace.json` — marketplace `hamreview`
- `LICENSE` — MIT, Samuel Asselin, 2026

**Modified:**
- `package.json` — name, bin, version, `private:false`, metadata, `files`, scripts, deps/devDeps split
- `next.config.ts` — `output: "standalone"`
- `src/cli.ts` — rename strings + env vars; spawn standalone server via `serverSpawnSpec`
- `src/server/context.ts` — env var names `FLOWREVIEW_*` → `HAMREVIEW_*`
- `app/layout.tsx` — page title/branding
- `README.md` — new install flow, HamReview branding
- test files referencing the old name/env (`src/server/*.test.ts`) — updated

---

## Task 1: Rebrand the codebase to `hamreview`

Pure rename: identifiers, filenames, internal env var names, and branding strings. No behavior change; the whole suite stays green. The CLI still spawns `next start` here — the standalone switch is Task 3.

**Files:**
- Modify: `package.json` (name, bin), `src/cli.ts`, `src/server/context.ts`, `app/layout.tsx`
- Rename: `bin/flowreview.mjs` → `bin/hamreview.mjs`
- Modify (tests): `src/server/abort.test.ts`, `src/server/context.test.ts`, `src/server/contract-roundtrip.test.ts`, `src/server/git.test.ts`, `src/server/net.test.ts`, `src/server/paths.test.ts`, `src/server/roundtrip.test.ts`, `src/server/routes.test.ts`

**Interfaces:**
- Produces: env vars `HAMREVIEW_HANDOFF`, `HAMREVIEW_FEEDBACK_OUT`, `HAMREVIEW_DONE` (read by `readEnv` in `src/server/context.ts`, set by the CLI). Later tasks rely on these exact names.

- [ ] **Step 1: Rename the bin file**

```bash
git mv bin/flowreview.mjs bin/hamreview.mjs
```

- [ ] **Step 2: Update `package.json` name + bin**

In `package.json`, change:
```json
  "name": "flowreview",
```
to:
```json
  "name": "hamreview",
```
and:
```json
  "bin": {
    "flowreview": "bin/flowreview.mjs"
  },
```
to:
```json
  "bin": {
    "hamreview": "bin/hamreview.mjs"
  },
```

- [ ] **Step 3: Rename env vars + branding strings in `src/server/context.ts`**

In `src/server/context.ts`, change the three `required(env, "FLOWREVIEW_...")` calls:
```ts
  const handoffPath = required(env, "HAMREVIEW_HANDOFF");
  const feedbackOut = required(env, "HAMREVIEW_FEEDBACK_OUT");
  const donePath = required(env, "HAMREVIEW_DONE");
```

- [ ] **Step 4: Rename strings + env vars in `src/cli.ts`**

In `src/cli.ts`, change the usage line:
```ts
    console.error("usage: hamreview <handoff.json>");
```
the temp-dir prefix:
```ts
  const work = mkdtempSync(join(tmpdir(), "hamreview-run-"));
```
the spawn env keys:
```ts
    env: {
      ...process.env,
      HAMREVIEW_HANDOFF: handoffPath,
      HAMREVIEW_FEEDBACK_OUT: feedbackOut,
      HAMREVIEW_DONE: donePath,
    },
```
and the open message:
```ts
    console.log(`HamReview open at ${url} — review, then submit in the browser (Ctrl-C to abort).`);
```

- [ ] **Step 5: Update the app title in `app/layout.tsx`**

Read `app/layout.tsx` and replace any user-facing `FlowReview` (e.g. `metadata.title`, header text) with `HamReview`. Leave imports/component names that merely contain the substring only if they are not user-visible; the goal is that the browser tab and any on-screen title read **HamReview**.

- [ ] **Step 6: Update tests referencing the old name/env**

Mechanically update the test files. Replace env var references and the product/binary name:
```bash
git grep -lE "FLOWREVIEW_|flowreview|FlowReview" -- src/server/*.test.ts | while read -r f; do
  sed -i '' \
    -e 's/FLOWREVIEW_/HAMREVIEW_/g' \
    -e 's/flowreview/hamreview/g' \
    -e 's/FlowReview/HamReview/g' "$f"
done
```
Then open `src/server/paths.test.ts` and confirm the fake paths now read `hamreview` (they are cosmetic strings in `packageRootFrom` assertions) and still assert the correct two-levels-up result.

- [ ] **Step 7: Verify no stray old-name references remain in code**

Run:
```bash
git grep -nE "FLOWREVIEW_|flowreview|FlowReview" -- src app bin package.json
```
Expected: **no output** (all code/config renamed; `docs/` is intentionally excluded).

- [ ] **Step 8: Run the full suite + core typecheck**

Run:
```bash
npm test && npm run typecheck:core
```
Expected: PASS (all tests green, core stays framework/DOM-free).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename the tool to hamreview (identifiers, env vars, branding)"
```

---

## Task 2: Make `package.json` publishable + add LICENSE

Flip `private`, bump the version, and add the metadata npm needs for a clean public listing. Repo URLs target the post-rename slug `samuelasselin/hamreview`.

**Files:**
- Modify: `package.json`
- Create: `LICENSE`

- [ ] **Step 1: Add the MIT LICENSE**

Create `LICENSE`:
```text
MIT License

Copyright (c) 2026 Samuel Asselin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Set publish metadata in `package.json`**

Change:
```json
  "name": "hamreview",
  "version": "0.0.0",
  "private": true,
  "type": "module",
```
to:
```json
  "name": "hamreview",
  "version": "1.0.0",
  "private": false,
  "type": "module",
  "description": "Review AI-generated code by the flow of data, not file-by-file — a blocking, human-in-the-loop review for coding agents.",
  "license": "MIT",
  "author": "Samuel Asselin",
  "homepage": "https://github.com/samuelasselin/hamreview#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/samuelasselin/hamreview.git"
  },
  "bugs": {
    "url": "https://github.com/samuelasselin/hamreview/issues"
  },
  "keywords": [
    "code-review",
    "ai",
    "claude-code",
    "agent",
    "diff",
    "git",
    "developer-tools"
  ],
  "publishConfig": {
    "access": "public"
  },
```

- [ ] **Step 3: Verify it still typechecks and tests pass**

Run:
```bash
npm test && npm run typecheck:core
```
Expected: PASS (metadata-only change).

- [ ] **Step 4: Commit**

```bash
git add package.json LICENSE
git commit -m "build: make the package publishable (metadata, MIT license, v1.0.0)"
```

---

## Task 3: Standalone Next output + CLI spawns the standalone server

The core of the "lean `npx`" payoff. Turn on Next `standalone`, add a build step that completes the standalone dir, extract a testable spawn spec, switch the CLI to `node .next/standalone/server.js`, and move the UI libraries to devDependencies.

**Files:**
- Modify: `next.config.ts`, `package.json` (scripts + deps split), `src/cli.ts`
- Create: `scripts/prepare-standalone.mjs`, `src/server/standalone.ts`, `src/server/standalone.test.ts`

**Interfaces:**
- Consumes: env var names `HAMREVIEW_*` from Task 1; `packageRootFrom` from `src/server/paths.ts`.
- Produces: `standaloneServerPath(packageRoot: string): string` and `serverSpawnSpec(opts): { command, args, env }` in `src/server/standalone.ts`.

- [ ] **Step 1: Write the failing test for the standalone helpers**

Create `src/server/standalone.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { standaloneServerPath, serverSpawnSpec } from "./standalone";

describe("standaloneServerPath", () => {
  it("points at .next/standalone/server.js under the package root", () => {
    expect(standaloneServerPath("/opt/hamreview")).toBe(
      "/opt/hamreview/.next/standalone/server.js",
    );
  });
});

describe("serverSpawnSpec", () => {
  it("runs node against the standalone server with port, host, and HAMREVIEW_ env", () => {
    const spec = serverSpawnSpec({
      execPath: "/usr/bin/node",
      packageRoot: "/opt/hamreview",
      port: 4321,
      handoffPath: "/proj/handoff.json",
      feedbackOut: "/proj/feedback.json",
      donePath: "/tmp/run/.done",
      baseEnv: { PATH: "/usr/bin" },
    });
    expect(spec.command).toBe("/usr/bin/node");
    expect(spec.args).toEqual(["/opt/hamreview/.next/standalone/server.js"]);
    expect(spec.env.PORT).toBe("4321");
    expect(spec.env.HOSTNAME).toBe("127.0.0.1");
    expect(spec.env.HAMREVIEW_HANDOFF).toBe("/proj/handoff.json");
    expect(spec.env.HAMREVIEW_FEEDBACK_OUT).toBe("/proj/feedback.json");
    expect(spec.env.HAMREVIEW_DONE).toBe("/tmp/run/.done");
    expect(spec.env.PATH).toBe("/usr/bin"); // base env preserved
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
npx vitest run src/server/standalone.test.ts
```
Expected: FAIL — `Cannot find module './standalone'`.

- [ ] **Step 3: Implement the helpers**

Create `src/server/standalone.ts`:
```ts
import { join } from "node:path";

/** Absolute path to the built standalone server, given the package root. */
export function standaloneServerPath(packageRoot: string): string {
  return join(packageRoot, ".next", "standalone", "server.js");
}

export interface ServerSpawnSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * Build the spawn spec for the review server: run `node` against the
 * standalone server, binding it to a free port on localhost and passing the
 * HAMREVIEW_* env the API routes read at request time.
 */
export function serverSpawnSpec(opts: {
  execPath: string;
  packageRoot: string;
  port: number;
  handoffPath: string;
  feedbackOut: string;
  donePath: string;
  baseEnv: NodeJS.ProcessEnv;
}): ServerSpawnSpec {
  return {
    command: opts.execPath,
    args: [standaloneServerPath(opts.packageRoot)],
    env: {
      ...opts.baseEnv,
      PORT: String(opts.port),
      HOSTNAME: "127.0.0.1",
      HAMREVIEW_HANDOFF: opts.handoffPath,
      HAMREVIEW_FEEDBACK_OUT: opts.feedbackOut,
      HAMREVIEW_DONE: opts.donePath,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npx vitest run src/server/standalone.test.ts
```
Expected: PASS.

- [ ] **Step 5: Wire the helpers into `src/cli.ts`**

In `src/cli.ts`, add the import:
```ts
import { serverSpawnSpec } from "./server/standalone";
```
Replace the `const server = spawn("npx", ["next", "start", ...], {...})` block (the current inline spawn) with:
```ts
  const packageRoot = packageRootFrom(import.meta.url);
  const spec = serverSpawnSpec({
    execPath: process.execPath,
    packageRoot,
    port,
    handoffPath,
    feedbackOut,
    donePath,
    baseEnv: process.env,
  });
  const server = spawn(spec.command, spec.args, {
    cwd: packageRoot,
    stdio: "inherit",
    env: spec.env,
  });
```
(The existing `packageRootFrom` import stays; remove the now-duplicate `const packageRoot = ...` line if it appears twice.)

- [ ] **Step 6: Turn on standalone output in `next.config.ts`**

Change:
```ts
const nextConfig: NextConfig = {};
```
to:
```ts
const nextConfig: NextConfig = {
  output: "standalone",
};
```

- [ ] **Step 7: Add the standalone-prep script**

Create `scripts/prepare-standalone.mjs`:
```js
#!/usr/bin/env node
// Next `standalone` output does NOT copy static assets into the standalone
// dir; the server expects them at .next/standalone/.next/static. Copy them so
// the shipped .next/standalone is self-contained. (There is no public/ dir.)
import { cpSync, existsSync } from "node:fs";

const from = ".next/static";
const to = ".next/standalone/.next/static";

if (!existsSync(from)) {
  console.error(`prepare-standalone: ${from} not found — did 'next build' run?`);
  process.exit(1);
}
cpSync(from, to, { recursive: true });
console.log(`prepare-standalone: copied ${from} -> ${to}`);
```

- [ ] **Step 8: Update build scripts + split dependencies in `package.json`**

Change the `build` and `prepack` scripts:
```json
    "build": "next build && node scripts/prepare-standalone.mjs",
    "prepack": "npm run build",
```
Move the UI/build libraries out of `dependencies` into `devDependencies`, leaving only the CLI runtime deps. The two blocks become:
```json
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.2",
    "@types/node": "^22.10.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "flowbite-react": "^0.12.17",
    "next": "^15.5.20",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "tailwindcss": "^4.3.2",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  },
  "dependencies": {
    "open": "^10.2.0",
    "tsx": "^4.22.4"
  }
```
Then reinstall so the lockfile reflects the split:
```bash
npm install
```

- [ ] **Step 9: Build and verify the standalone output exists**

Run:
```bash
npm run build
test -f .next/standalone/server.js && echo "OK server.js" || echo "MISSING server.js"
test -d .next/standalone/.next/static && echo "OK static" || echo "MISSING static"
```
Expected: `OK server.js` and `OK static`.

- [ ] **Step 10: Run the unit suite + core typecheck**

Run:
```bash
npm test && npm run typecheck:core
```
Expected: PASS.

- [ ] **Step 11: Manual smoke — run a real review against the standalone server**

```bash
mkdir -p /tmp/ham-smoke && cd /tmp/ham-smoke && git init -q
printf 'a\n' > f.txt && git add -A && git -c user.email=t@t -c user.name=t commit -qm init
printf 'a\nb\nc\n' > f.txt && git add -A
cat > handoff.json <<'JSON'
{ "version": 1, "root": "/tmp/ham-smoke", "base": "working-tree", "feature": "smoke",
  "flows": [ { "id": "f", "title": "F", "steps": [ { "path": "f.txt", "ranges": [[2,3]], "role": "content" } ] } ] }
JSON
node <REPO>/bin/hamreview.mjs handoff.json
```
Expected: browser opens the focus-mode review served by the standalone server; after submitting, `feedback.json` is written in `/tmp/ham-smoke`. Then `cd` back and `rm -rf /tmp/ham-smoke`. (Replace `<REPO>` with the absolute path to this repo.)

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "build: ship a lean standalone runtime; spawn the built server from the CLI"
```

---

## Task 4: Slim the published `files` allowlist + verify packaging

Only ship what the installed tool needs: the standalone runtime (UI) and `src` + `bin` (the tsx-run CLI). Verify the tarball excludes source app/config and the build cache.

**Files:**
- Modify: `package.json` (`files`)

- [ ] **Step 1: Narrow the `files` allowlist**

Change:
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
to:
```json
  "files": [
    ".next/standalone",
    "src",
    "bin"
  ],
```
(`package.json`, `README.md`, and `LICENSE` are always included by npm.)

- [ ] **Step 2: Verify the packed tarball contents**

Run:
```bash
npm pack --dry-run 2>&1 | grep -E "standalone|src/|bin/|\.next/cache|app/|README|LICENSE" | head -40
```
Expected: entries under `.next/standalone/…`, `src/…`, `bin/hamreview.mjs`, plus `README.md` and `LICENSE`. Expected **absent**: any `.next/cache/…` and top-level `app/…` source.

- [ ] **Step 3: Verify the bin still prints usage with no args**

Run:
```bash
node bin/hamreview.mjs; echo "exit=$?"
```
Expected: prints `usage: hamreview <handoff.json>` and `exit=2`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build: ship only the standalone runtime + CLI in the npm tarball"
```

---

## Task 5: Claude Code plugin + marketplace manifests

Make the repo installable as a Claude Code plugin from its own marketplace, and relocate the skill/command to the plugin's expected root layout. The skill invokes `npx -y hamreview` so installing the plugin is the only user step.

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- Move: `integrations/claude-code/skills/flow-review/SKILL.md` → `skills/ham-review/SKILL.md`
- Move: `integrations/claude-code/commands/flow-review.md` → `commands/ham-review.md`
- Delete: `integrations/` (once empty)

- [ ] **Step 1: Create the plugin manifest**

Create `.claude-plugin/plugin.json`:
```json
{
  "name": "ham-review",
  "version": "1.0.0",
  "description": "Review AI-generated code by the flow of data, not file-by-file.",
  "author": { "name": "Samuel Asselin" },
  "homepage": "https://github.com/samuelasselin/hamreview",
  "repository": "https://github.com/samuelasselin/hamreview",
  "keywords": ["code-review", "claude-code", "workflow"]
}
```

- [ ] **Step 2: Create the marketplace manifest**

Create `.claude-plugin/marketplace.json`:
```json
{
  "name": "hamreview",
  "owner": {
    "name": "Samuel Asselin",
    "url": "https://github.com/samuelasselin"
  },
  "plugins": [
    { "name": "ham-review", "source": "." }
  ]
}
```

- [ ] **Step 3: Relocate and rename the skill**

```bash
mkdir -p skills/ham-review
git mv integrations/claude-code/skills/flow-review/SKILL.md skills/ham-review/SKILL.md
```
In `skills/ham-review/SKILL.md`, change the frontmatter name:
```markdown
name: ham-review
```
Change the review-launch line (step 5) from `flowreview handoff.json` to:
```markdown
5. **Open the review (this blocks your turn):** run `npx -y hamreview handoff.json` from the repo root. Your turn blocks until the human submits in their browser; then `feedback.json` is written to your current directory (the directory you run it from — the repo root in this workflow).
```
Replace the **Requirements** section with:
```markdown
## Requirements
- Node.js ≥ 20 must be installed (`node --version`). The CLI is fetched and run via `npx -y hamreview` — no manual install needed.
- If `git diff` is empty, there is nothing to review — say so and do not open the tool.
```

- [ ] **Step 4: Relocate and rename the command**

```bash
mkdir -p commands
git mv integrations/claude-code/commands/flow-review.md commands/ham-review.md
```
In `commands/ham-review.md`, change step 4 from `flowreview handoff.json` to:
```markdown
4. Run `npx -y hamreview handoff.json` — this blocks until I submit in the browser.
```

- [ ] **Step 5: Remove the now-empty integrations tree**

```bash
rm -rf integrations
```

- [ ] **Step 6: Validate the manifests are well-formed JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8')); console.log('manifests OK')"
```
Expected: `manifests OK`.

- [ ] **Step 7: Verify the plugin layout + no old-name refs in the integration**

Run:
```bash
test -f skills/ham-review/SKILL.md && test -f commands/ham-review.md && echo "layout OK"
git grep -nE "flowreview|flow-review|FlowReview" -- skills commands .claude-plugin
```
Expected: `layout OK`, and **no output** from the grep.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: package the repo as a Claude Code plugin and marketplace"
```

---

## Task 6: Rewrite the README for the zero-setup install

Rebrand to HamReview and replace the clone/`npm link` install with the `npx` + plugin flow. This is the user-facing payoff, so it gets its own reviewable task.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rebrand and rewrite the install/use sections**

Rewrite `README.md` so:
- The title and all prose use **HamReview** / `hamreview`.
- Section "Requirements" keeps Node ≥ 20 + git.
- Section "Install" becomes two paths, no clone:
  ```bash
  # one-off / recommended — no install, downloads and caches:
  npx hamreview <handoff.json>

  # or install the command globally:
  npm i -g hamreview
  hamreview <handoff.json>
  ```
- The "Try it in 2 minutes" walkthrough uses `npx hamreview handoff.json`.
- The "Use it with a coding agent (Claude Code)" section becomes:
  ```text
  /plugin marketplace add samuelasselin/hamreview
  /plugin install ham-review@hamreview
  ```
  followed by: the agent runs the `ham-review` skill (or you run `/ham-review`) at a checkpoint; the skill runs `npx -y hamreview`, the browser opens the focus-mode review, feedback returns to the agent — no clone, no manual CLI install.
- The "contract" and "what you see" sections keep their content (they describe `handoff.json`/`feedback.json` and the UI, unchanged).
- The "Develop" section keeps `npm test` / `npm run typecheck` / `npm run typecheck:core` / `npm run build`, and drops the `npm unlink -g` line in favor of noting `npm rm -g hamreview` to remove a global install.

- [ ] **Step 2: Add a one-line note atop the distribution spec**

At the top of `docs/superpowers/specs/2026-07-03-flowreview-distribution-design.md`, add under the title:
```markdown
> **Shipped as `hamreview`** (2026-07-06): the unscoped npm name `hamreview` was free, so the tool was renamed from `flowreview` and published unscoped. See `docs/superpowers/plans/2026-07-06-hamreview-05-distribution.md`.
```

- [ ] **Step 3: Verify no user-facing old name remains in the README**

Run:
```bash
git grep -nE "flowreview|FlowReview" -- README.md
```
Expected: **no output**.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-07-03-flowreview-distribution-design.md
git commit -m "docs: rewrite the README for the npx + Claude Code plugin install"
```

---

## Task 7: Release (author-gated, external — NOT a subagent task)

These run once, interactively, with Samuel — they require npm/GitHub auth and outward-facing publication. Do not automate them inside the plan execution. Each is gated on explicit confirmation.

- [ ] **Step 1: Secret re-scan before anything goes public**

```bash
git grep -nIE '(api[_-]?key|secret|token|password|private[_-]?key|BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36})' -- . ':(exclude)package-lock.json' ':(exclude)*.tsbuildinfo' && echo "REVIEW ABOVE" || echo "clean"
```
Expected: `clean`. If anything prints, STOP and flag it (Karibew secrets rule) before proceeding.

- [ ] **Step 2: Publish to npm** (Samuel runs `npm login` first)

```bash
npm publish
```
(`publishConfig.access` is `public`; the unscoped name publishes public by default.) Verify: `npm view hamreview version` → `1.0.0`.

- [ ] **Step 3: Rename the GitHub repo + make it public**

```bash
gh repo rename hamreview --repo samuelasselin/flowreview
gh repo edit samuelasselin/hamreview --visibility public --accept-visibility-change-consequences
```
(GitHub redirects the old `flowreview` slug. Update the local remote: `git remote set-url origin https://github.com/samuelasselin/hamreview.git`.)

- [ ] **Step 4: Push + tag the release**

```bash
git push origin main
git tag v1.0.0 && git push origin v1.0.0
```

- [ ] **Step 5: Manual end-to-end verification**

- `npx -y hamreview` smoke against a throwaway project (as in Task 3 Step 11, but via the published package).
- In Claude Code: `/plugin marketplace add samuelasselin/hamreview` → `/plugin install ham-review@hamreview` → make a change in a project → run `/ham-review` → confirm the browser review opens and feedback returns to the agent.

---

## Self-Review

**Spec coverage** (against `2026-07-03-flowreview-distribution-design.md`):
- Decision 1 (publish to npm, no clone) → Tasks 2, 4, 7 (name is unscoped `hamreview` per the user's later decision, superseding the spec's scoped `@samuelasselin/flowreview`).
- Decision 2 (standalone runtime, CLI spawns the standalone server, deps slimmed) → Task 3.
- Decision 3 (plugin + marketplace in one repo, skill invokes `npx`, layout at root) → Task 5.
- Decision 4 (public GitHub repo) → Task 7 Step 3 (plus repo rename to match the new name).
- End-user experience / success criteria (`npx hamreview` + two-command plugin install) → Tasks 4, 5, 6, 7.
- Error handling / testing / release steps → Task 3 (build + smoke), Task 4 (pack), Task 5 (manifest validity), Task 7 (author-gated release + e2e).

**Deviations from the spec (intentional, per user decisions this session):**
- Unscoped `hamreview` instead of scoped `@samuelasselin/flowreview` (the tool is renamed, not scoped).
- Internal env vars renamed `FLOWREVIEW_* → HAMREVIEW_*` and the Claude Code plugin/command/skill renamed `flow-review → ham-review` for brand consistency (internal-only; no external contract change to `handoff.json`/`feedback.json`).
- GitHub repo renamed `flowreview → hamreview` (Task 7) so the marketplace slug matches the package.

**Placeholder scan:** no "TBD"/"handle errors"/"similar to Task N" — every code and JSON change is shown in full. The only late-bound value is `<REPO>` in the Task 3 manual-smoke command (the absolute repo path on the operator's machine), which is inherent to a manual step.

**Type/name consistency:** env vars `HAMREVIEW_HANDOFF|FEEDBACK_OUT|DONE` are produced in Task 1 (cli.ts) / read in Task 1 (context.ts) and reused unchanged in Task 3's `serverSpawnSpec`. `standaloneServerPath`/`serverSpawnSpec` signatures match between the test (Task 3 Step 1) and implementation (Task 3 Step 3) and the CLI call site (Task 3 Step 5). Package name `hamreview`, bin `hamreview`, plugin `ham-review`, marketplace `hamreview`, install `ham-review@hamreview` are consistent across Tasks 2, 5, 6, 7.
