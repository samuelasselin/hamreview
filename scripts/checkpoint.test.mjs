import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "checkpoint.mjs");

function git(repo, args) {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args]);
}

function gitOut(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function statePath(repo) {
  return join(gitOut(repo, ["rev-parse", "--absolute-git-dir"]), "hamreview-state.json");
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

  it("ignores the ham-review skill's own handoff.json/feedback.json artifacts", () => {
    // 1. A real, un-reviewed edit blocks.
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(JSON.parse(runHook(repo).stdout).decision).toBe("block");

    // 2. Reproduce the ham-review skill's own workflow: stage everything and
    //    drop its input/output contract files at the repo root. This must
    //    NOT change the signature — same state → allow.
    git(repo, ["add", "-A"]);
    writeFileSync(join(repo, "handoff.json"), JSON.stringify({ ok: true }));
    writeFileSync(join(repo, "feedback.json"), JSON.stringify({ ok: true }));
    expect(runHook(repo).stdout).toBe("");

    // 3. A genuinely new edit to a tracked file still re-triggers.
    writeFileSync(join(repo, "a.txt"), "one\ntwo\nthree\n");
    expect(JSON.parse(runHook(repo).stdout).decision).toBe("block");
  });

  it("fails open with a block (never-asked) when the state file is corrupt", () => {
    writeFileSync(statePath(repo), "not json{");
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const { stdout, status } = runHook(repo);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).decision).toBe("block");
  });

  it("fails open with allow when the state file cannot be written (path is a directory)", () => {
    mkdirSync(statePath(repo));
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const { stdout, status } = runHook(repo);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});
