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
import { parseStatus, filterArtifacts, computeSignature, decide, summarizeStatus, buildReason } from "./checkpoint-core.mjs";

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

// Returns "" for anything unreadable as a plain file — including a submodule
// entry, where `path` is a directory, not a file; submodule-only changes
// therefore share the "" marker and never re-ask. Known, accepted.
function shaOfWorkingFile(cwd, path) {
  try {
    return createHash("sha256").update(readFileSync(join(cwd, path))).digest("hex");
  } catch {
    return "";
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
    entries = filterArtifacts(parseStatus(git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])));
  } catch {
    return allow();
  }
  if (entries.length === 0) return allow();

  const signature = computeSignature(
    entries.map((e) => ({ path: e.path, contentSha: shaOfWorkingFile(cwd, e.path) })),
  );

  const statePath = join(gitDir, "hamreview-state.json");
  // The state file is shared with the commit-gate hook — always read the whole
  // object and merge on write, so neither hook erases the other's memory.
  let state = {};
  try {
    state = JSON.parse(readFileSync(statePath, "utf8")) ?? {};
  } catch {
    state = {};
  }

  if (!decide(signature, state.lastAskedSignature ?? "")) return allow();

  // Persist BEFORE asking. If the ask can't be recorded, allow — an unrecorded
  // block would re-fire every turn (an unbreakable loop).
  try {
    writeFileSync(statePath, JSON.stringify({ ...state, lastAskedSignature: signature }));
  } catch {
    return allow();
  }

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: buildReason(summarizeStatus(entries)),
    }),
  );
  process.exit(0);
}

try {
  main();
} catch {
  allow(); // fail open on anything unexpected
}
