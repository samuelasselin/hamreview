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
