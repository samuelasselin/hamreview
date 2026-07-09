#!/usr/bin/env node
// HamReview commit-gate PreToolUse hook (soft barrier).
// Fires before every Bash tool call. If the command is a `git commit` and the
// working tree holds changes the human has not reviewed, it denies the call
// ONCE (per exact working-tree state) with a prompt telling the agent to run
// the ham-review skill first; the retried commit goes through. FAILS OPEN on
// every error path — it must never trap the user. Uses only Node builtins.
// Spec: docs/superpowers/specs/2026-07-08-commit-gate-hook-design.md
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseStatus, filterArtifacts, computeSignature, decide, summarizeStatus, matchGitCommit, buildCommitGateReason } from "./checkpoint-core.mjs";

/** Print nothing and exit 0 — the "allow the call" decision. */
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
    return "";
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return allow();
  }
  const cwd = payload?.cwd;
  if (!cwd || payload?.tool_name !== "Bash") return allow();

  const match = matchGitCommit(payload?.tool_input?.command ?? "");
  if (!match) return allow();
  const repo = match.chdir ? resolve(cwd, match.chdir) : cwd;

  let gitDir;
  try {
    gitDir = git(repo, ["rev-parse", "--absolute-git-dir"]).trim();
  } catch {
    return allow(); // not a repo, or git missing
  }

  let entries;
  try {
    entries = filterArtifacts(parseStatus(git(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])));
  } catch {
    return allow();
  }
  if (entries.length === 0) return allow();

  const signature = computeSignature(
    entries.map((e) => ({ path: e.path, contentSha: shaOfWorkingFile(repo, e.path) })),
  );

  const statePath = join(gitDir, "hamreview-state.json");
  let state = {};
  try {
    state = JSON.parse(readFileSync(statePath, "utf8")) ?? {};
  } catch {
    state = {};
  }

  if (!decide(signature, state.lastCommitGateSignature ?? "")) return allow();

  // Persist BEFORE denying. If the ask can't be recorded, allow — an
  // unrecorded deny would block every retry (an unbreakable gate).
  try {
    writeFileSync(statePath, JSON.stringify({ ...state, lastCommitGateSignature: signature }));
  } catch {
    return allow();
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: buildCommitGateReason(summarizeStatus(entries)),
      },
    }),
  );
  process.exit(0);
}

try {
  main();
} catch {
  allow(); // fail open on anything unexpected
}
