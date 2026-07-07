import { describe, it, expect } from "vitest";
import { parseHandoff, HandoffValidationError } from "./schema";

const valid = {
  version: 1,
  root: "/repo",
  base: "working-tree",
  feature: "Bookings",
  flows: [
    {
      id: "create-booking",
      title: "Create booking",
      complete: false,
      steps: [
        { path: "app/models/booking.rb", ranges: [[3, 3]], role: "model", note: "adds validation" },
      ],
    },
  ],
};

describe("parseHandoff", () => {
  it("accepts a valid handoff (object or JSON string)", () => {
    const fromObj = parseHandoff(valid);
    expect(fromObj.flows[0].id).toBe("create-booking");
    expect(fromObj.flows[0].steps[0].ranges[0]).toEqual([3, 3]);
    const fromStr = parseHandoff(JSON.stringify(valid));
    expect(fromStr).toEqual(fromObj);
  });

  it("rejects a wrong version", () => {
    expect(() => parseHandoff({ ...valid, version: 2 })).toThrow(HandoffValidationError);
  });

  it("rejects an empty flows array", () => {
    expect(() => parseHandoff({ ...valid, flows: [] })).toThrow(/non-empty array/);
  });

  it("rejects duplicate flow ids", () => {
    const dup = { ...valid, flows: [valid.flows[0], valid.flows[0]] };
    expect(() => parseHandoff(dup)).toThrow(/duplicate flow id/);
  });

  it("rejects a range whose end < start", () => {
    const bad = structuredClone(valid);
    bad.flows[0].steps[0].ranges = [[5, 2]];
    expect(() => parseHandoff(bad)).toThrow(/end must be >= start/);
  });

  it("rejects invalid JSON strings", () => {
    expect(() => parseHandoff("{not json")).toThrow(HandoffValidationError);
  });
});

describe("step path safety", () => {
  const handoffWith = (path: string) => ({
    version: 1,
    root: "/r",
    base: "working-tree",
    flows: [{ id: "f", title: "F", steps: [{ path, ranges: [[1, 1]], role: "x" }] }],
  });

  it("rejects an absolute path", () => {
    expect(() => parseHandoff(handoffWith("/etc/passwd"))).toThrow(HandoffValidationError);
    expect(() => parseHandoff(handoffWith("/etc/passwd"))).toThrow(/relative to root/);
  });

  it("rejects a Windows-style absolute path", () => {
    expect(() => parseHandoff(handoffWith("C:\\secrets.txt"))).toThrow(/relative to root/);
  });

  it("rejects .. traversal segments", () => {
    expect(() => parseHandoff(handoffWith("../../etc/passwd"))).toThrow(/"\." or "\.\." segments/);
  });

  it("rejects . segments", () => {
    expect(() => parseHandoff(handoffWith("./a.txt"))).toThrow(/"\." or "\.\." segments/);
  });

  it("accepts a normal nested relative path", () => {
    expect(() => parseHandoff(handoffWith("src/app/x.ts"))).not.toThrow();
  });
});
