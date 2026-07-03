# FlowReview — Distribution Design Spec (npm + Claude Code plugin)

- **Date:** 2026-07-03
- **Status:** Approved for planning
- **Depends on:** the complete tool on `main` (Plans 1–4).
- **Goal:** make FlowReview usable with **no clone** and installable as a **Claude Code plugin from a marketplace** — the "install once, use everywhere," Plannotator-style experience.

## Purpose

Today, using FlowReview means clone → `npm install` → `npm run build` → `npm link`. This makes it a one-command install (`npx`/global) and a two-command Claude Code plugin install, so a coding agent can review-by-flow with essentially zero setup.

## Decisions

### 1. Publish the CLI to npm as a scoped public package
- Package name: **`@samuelasselin/flowreview`** (the unscoped `flowreview` is already taken on npm at v0.1.3; scoping avoids the collision and ties it to the author). The **bin stays `flowreview`**.
- `package.json`: `"private": false`, `"publishConfig": { "access": "public" }`, plus `repository`, `license`, `description`, `keywords`, `homepage`.
- No clone needed: `npm i -g @samuelasselin/flowreview` (gives the `flowreview` command) or `npx @samuelasselin/flowreview <handoff.json>` (downloads-and-runs, cached).

### 2. Slim the runtime with Next `standalone` output
The CLI is a full Next.js app, so a naive publish would make `npx` pull a huge dependency tree. To keep first-run lean:
- Set `output: "standalone"` in `next.config.ts`. `next build` then emits `.next/standalone/` (a minimal `server.js` with only the traced runtime deps) — much smaller than the full `node_modules`.
- The build/`prepack` step copies `.next/static` (and `public/` if present) into `.next/standalone/` (Next does not copy these automatically).
- The **CLI spawns the standalone server** — `node <packageRoot>/.next/standalone/server.js` with `PORT`/`HOSTNAME` and the `FLOWREVIEW_*` env — instead of `next start`.
- Runtime `dependencies` shrink to what the **CLI** itself needs (`open` for the browser, `tsx` to run `src/cli.ts`); the app's build-time libraries (`next`, `react`, `react-dom`, `flowbite-react`, tailwind) become **devDependencies** (they're baked into `.next/standalone` at build time and are not installed by `npx`).
- The published `files` ship `.next/standalone`, `.next/static`, `src`, `bin`, and configs — not `.next/cache`.

### 3. Package this repo as a Claude Code plugin **and** marketplace (single repo)
Per Claude Code docs, one repo can be both:
- `.claude-plugin/plugin.json` — plugin `flow-review` (`name`, `version`, `description`, `author`, `homepage`, `repository`).
- `.claude-plugin/marketplace.json` — marketplace `flowreview`, `owner`, `plugins: [{ name: "flow-review", source: "." }]`.
- Relocate the integration to the plugin's expected layout at the **repo root**: `skills/flow-review/SKILL.md` and `commands/flow-review.md` (moved from `integrations/claude-code/…`).
- The skill invokes **`npx @samuelasselin/flowreview handoff.json`**, so installing the plugin is the only step a user takes — the CLI auto-fetches.

### 4. Make the GitHub repo public
Required so others can `/plugin marketplace add samuelasselin/flowreview`; the npm package is public regardless.

## End-user experience (the payoff)

```text
/plugin marketplace add samuelasselin/flowreview
/plugin install flow-review@flowreview
```
Then the coding agent invokes the `flow-review` skill at a checkpoint (or the human runs `/flow-review`); the skill runs `npx @samuelasselin/flowreview`, the browser opens the focus-mode review, feedback returns to the agent. **No clone, no manual CLI install.**

## Error handling
- **`node`/`npm` absent** → the skill states the Node ≥ 20 requirement; `npx` fails fast with a clear message.
- **Standalone server fails to start** → the CLI's existing `waitForUrl` timeout reports "server did not start in time" and exits non-zero.
- **`npm publish` auth** → performed by the author (`npm login`) at the release step; not automated.
- All existing CLI error handling (bad handoff, abort, git-diff) is unchanged.

## Testing
- **Standalone build** → `next build` produces `.next/standalone/server.js`; verified in the build step.
- **Packaging** → `npm pack --dry-run` ships `.next/standalone` + `.next/static` + `src` + `bin` (not `.next/cache`); the `flowreview` bin still prints usage with no args.
- **Plugin/marketplace validity** → `plugin.json` and `marketplace.json` are valid JSON with the required fields; the skill/command sit at the correct plugin paths and reference `npx @samuelasselin/flowreview`.
- **CLI path logic** (spawning the standalone server from the package dir; feedback to invoking cwd) → unit-tested via the existing pure helpers, updated for the standalone server path.
- **Manual e2e (human step, cannot be asserted in CI)** → add the marketplace locally, install the plugin, and run a real review end-to-end; and a real `npx @samuelasselin/flowreview` (or packed-tarball) smoke.

## Release steps (author-gated, external — not subagent tasks)
1. `npm login` (author signs up/logs in) → `npm publish --access public`.
2. Make the GitHub repo public (`gh repo edit samuelasselin/flowreview --visibility public`).
3. Tag a release (e.g. `v1.0.0`).

These run once, with the author, after the build/packaging/plugin work is complete and verified.

## Non-goals (v1)
- An unscoped npm name (renaming the tool — keeping `flowreview`).
- Compiling the CLI away from `tsx` (kept as a runtime dep).
- Multi-plugin marketplace (single plugin for now).

## Success criteria
- `npx @samuelasselin/flowreview <handoff.json>` runs a review against any project with no clone and no prior install.
- `/plugin marketplace add samuelasselin/flowreview` + `/plugin install flow-review@flowreview` yields a working flow-review skill + command, and the agent-driven loop works end to end via `npx`.
- The published package is lean (standalone runtime, no `.next/cache`).
