import { describe, it, expect } from "vitest";
import { parseStatus, filterArtifacts, computeSignature, decide, summarizeStatus, buildReason, matchGitCommit, buildCommitGateReason } from "./checkpoint-core.mjs";

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

describe("filterArtifacts", () => {
  it("filters the ham-review skill's own root-level contract files", () => {
    const entries = [
      { status: "??", path: "handoff.json" },
      { status: "??", path: "feedback.json" },
      { status: "M ", path: "a.txt" },
    ];
    expect(filterArtifacts(entries)).toEqual([{ status: "M ", path: "a.txt" }]);
  });

  it("keeps nested paths with the same basename", () => {
    const entries = [
      { status: "??", path: "sub/handoff.json" },
      { status: "??", path: "nested/dir/feedback.json" },
    ];
    expect(filterArtifacts(entries)).toEqual(entries);
  });

  it("keeps everything else untouched", () => {
    const entries = [{ status: "M ", path: "a.txt" }, { status: "??", path: "b.txt" }];
    expect(filterArtifacts(entries)).toEqual(entries);
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
    expect(r).toContain("in the background");
  });
});

describe("matchGitCommit", () => {
  it("matches a plain git commit", () => {
    expect(matchGitCommit('git commit -m "add feature"')).toEqual({ chdir: null });
  });

  it("matches a commit chained after other commands", () => {
    expect(matchGitCommit('git add -A && git commit -m "x"')).toEqual({ chdir: null });
  });

  it("captures the -C target directory", () => {
    expect(matchGitCommit('git -C sub/repo commit -m "x"')).toEqual({ chdir: "sub/repo" });
  });

  it("skips -c config pairs before the subcommand", () => {
    expect(matchGitCommit('git -c user.name=t commit -m "x"')).toEqual({ chdir: null });
  });

  it("matches --amend commits", () => {
    expect(matchGitCommit("git commit --amend --no-edit")).toEqual({ chdir: null });
  });

  it("does not match other git subcommands", () => {
    expect(matchGitCommit("git status")).toBeNull();
    expect(matchGitCommit("git log --oneline")).toBeNull();
    expect(matchGitCommit("git merge --no-commit topic")).toBeNull();
    expect(matchGitCommit('git stash push -m "commit later"')).toBeNull();
  });

  it("does not match commands without git", () => {
    expect(matchGitCommit("npm test")).toBeNull();
    expect(matchGitCommit("")).toBeNull();
  });
});

describe("buildCommitGateReason", () => {
  it("embeds the summary, the skill, and the soft-retry escape hatch", () => {
    const r = buildCommitGateReason("M a.txt");
    expect(r).toContain("ham-review commit gate");
    expect(r).toContain("M a.txt");
    expect(r).toContain("ham-review skill");
    expect(r).toContain("in the background");
    expect(r).toContain("re-run the same commit");
  });
});
