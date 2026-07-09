import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const GATE = join(dirname(fileURLToPath(import.meta.url)), "commit-gate.mjs");
const CHECKPOINT = join(dirname(fileURLToPath(import.meta.url)), "checkpoint.mjs");

function git(repo, args) {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args]);
}

function gitOut(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function statePath(repo) {
  return join(gitOut(repo, ["rev-parse", "--absolute-git-dir"]), "hamreview-state.json");
}

/** Run the gate with a PreToolUse payload; returns { stdout, status }. */
function runGate(cwd, command, extra = {}) {
  try {
    const stdout = execFileSync("node", [GATE], {
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command },
        cwd,
        ...extra,
      }),
      encoding: "utf8",
    });
    return { stdout, status: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

function runCheckpoint(cwd) {
  try {
    const stdout = execFileSync("node", [CHECKPOINT], {
      input: JSON.stringify({ hook_event_name: "Stop", cwd }),
      encoding: "utf8",
    });
    return { stdout, status: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

function denyOf(stdout) {
  const out = JSON.parse(stdout).hookSpecificOutput;
  expect(out.hookEventName).toBe("PreToolUse");
  return out;
}

const COMMIT = 'git commit -m "x"';

let repo;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "hamreview-gate-"));
  git(repo, ["init", "-q"]);
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "init"]);
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("commit gate hook", () => {
  it("denies the first commit of un-reviewed changes", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const { stdout, status } = runGate(repo, COMMIT);
    expect(status).toBe(0);
    const out = denyOf(stdout);
    expect(out.permissionDecision).toBe("deny");
    expect(out.permissionDecisionReason).toContain("ham-review commit gate");
    expect(out.permissionDecisionReason).toContain("a.txt");
  });

  it("is soft: the retried commit of the same changes goes through", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(denyOf(runGate(repo, COMMIT).stdout).permissionDecision).toBe("deny");
    expect(runGate(repo, COMMIT).stdout).toBe(""); // retry → allow
  });

  it("asks again when new edits change the working tree", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(denyOf(runGate(repo, COMMIT).stdout).permissionDecision).toBe("deny");
    writeFileSync(join(repo, "a.txt"), "one\ntwo\nthree\n");
    expect(denyOf(runGate(repo, COMMIT).stdout).permissionDecision).toBe("deny");
  });

  it("ignores non-commit commands on a dirty tree", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(runGate(repo, "git status").stdout).toBe("");
    expect(runGate(repo, "npm test").stdout).toBe("");
  });

  it("ignores non-Bash tools", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const { stdout } = runGate(repo, COMMIT, { tool_name: "Write" });
    expect(stdout).toBe("");
  });

  it("allows a commit on a clean tree", () => {
    expect(runGate(repo, COMMIT).stdout).toBe("");
  });

  it("allows when only the skill's own artifacts are dirty", () => {
    writeFileSync(join(repo, "handoff.json"), "{}");
    writeFileSync(join(repo, "feedback.json"), "{}");
    expect(runGate(repo, COMMIT).stdout).toBe("");
  });

  it("gates the repo named by -C, not the session cwd", () => {
    const inner = join(repo, "inner");
    mkdirSync(inner);
    git(inner, ["init", "-q"]);
    writeFileSync(join(inner, "b.txt"), "new\n");
    const { stdout } = runGate(repo, 'git -C inner commit -m "x"');
    expect(denyOf(stdout).permissionDecision).toBe("deny");
    expect(denyOf(stdout).permissionDecisionReason).toContain("b.txt");
  });

  it("allows when cwd is not a git repo", () => {
    const notRepo = mkdtempSync(join(tmpdir(), "hamreview-nonrepo-"));
    try {
      const { stdout, status } = runGate(notRepo, COMMIT);
      expect(status).toBe(0);
      expect(stdout).toBe("");
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });

  it("fails open with a deny (never-asked) when the state file is corrupt", () => {
    writeFileSync(statePath(repo), "not json{");
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const { stdout, status } = runGate(repo, COMMIT);
    expect(status).toBe(0);
    expect(denyOf(stdout).permissionDecision).toBe("deny");
  });

  it("fails open with allow when the state file cannot be written", () => {
    mkdirSync(statePath(repo));
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    const { stdout, status } = runGate(repo, COMMIT);
    expect(status).toBe(0);
    expect(stdout).toBe("");
  });
});

describe("state sharing between the gate and the checkpoint hook", () => {
  it("a checkpoint ask does not erase the gate's memory", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(denyOf(runGate(repo, COMMIT).stdout).permissionDecision).toBe("deny");
    // The Stop checkpoint fires on the same state and records its own ask…
    expect(JSON.parse(runCheckpoint(repo).stdout).decision).toBe("block");
    // …which must NOT clobber the gate's key: the retried commit still passes.
    expect(runGate(repo, COMMIT).stdout).toBe("");
  });

  it("a gate ask does not erase the checkpoint's memory", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    expect(JSON.parse(runCheckpoint(repo).stdout).decision).toBe("block");
    expect(denyOf(runGate(repo, COMMIT).stdout).permissionDecision).toBe("deny");
    expect(runCheckpoint(repo).stdout).toBe(""); // same state → still remembered
  });

  it("both keys coexist in the state file", () => {
    writeFileSync(join(repo, "a.txt"), "one\ntwo\n");
    runGate(repo, COMMIT);
    runCheckpoint(repo);
    const state = JSON.parse(readFileSync(statePath(repo), "utf8"));
    expect(state.lastCommitGateSignature).toBeTruthy();
    expect(state.lastAskedSignature).toBeTruthy();
    expect(state.lastCommitGateSignature).toBe(state.lastAskedSignature);
  });
});
