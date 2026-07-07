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
