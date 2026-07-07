import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { getWorkingDiff, makeFileReader } from "./git";

let repo: string;

function git(args: string[]): void {
  execFileSync("git", ["-C", repo, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "hamreview-git-"));
  git(["init", "-q"]);
  writeFileSync(join(repo, "a.txt"), "one\ntwo\nthree\n");
  git(["add", "."]);
  git(["commit", "-q", "-m", "init"]);
  // now make a working-tree change
  writeFileSync(join(repo, "a.txt"), "one\ntwo\nCHANGED\nfour\n");
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("getWorkingDiff", () => {
  it("returns a unified diff of the working tree", () => {
    const diff = getWorkingDiff(repo);
    expect(diff).toContain("diff --git a/a.txt b/a.txt");
    expect(diff).toContain("+CHANGED");
  });
});

describe("makeFileReader", () => {
  it("reads a file relative to root as lines", () => {
    const read = makeFileReader(repo);
    expect(read("a.txt")).toEqual(["one", "two", "CHANGED", "four", ""]);
  });

  it("returns [] for a missing file", () => {
    expect(makeFileReader(repo)("nope.txt")).toEqual([]);
  });
});

describe("makeFileReader containment (defense in depth)", () => {
  it("refuses to read outside root even if validation is bypassed", () => {
    expect(makeFileReader(repo)("../outside.txt")).toEqual([]);
    expect(makeFileReader(repo)("/etc/passwd")).toEqual([]);
    expect(makeFileReader(repo)("a/../../outside.txt")).toEqual([]);
  });
});
