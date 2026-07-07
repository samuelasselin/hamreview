import { describe, it, expect } from "vitest";
import { enclosingContext, enclosingContextCapped } from "./context";

describe("enclosingContext", () => {
  it("expands to the enclosing class in an `end`-delimited language", () => {
    const lines = [
      "# frozen_string_literal: true",                 // 1
      "",                                               // 2
      "class Booking < ApplicationRecord",              // 3
      "  belongs_to :user",                             // 4
      "  validates :end_at, greater_than: :start_at",   // 5
      "  scope :upcoming, -> { where('x') }",           // 6
      "end",                                            // 7
    ];
    expect(enclosingContext(lines, [5, 5])).toEqual([3, 7]);
  });

  it("expands to the enclosing function in a brace-delimited language", () => {
    const lines = [
      "export function create(req, res) {", // 1
      "  const data = parse(req)",          // 2
      "  const booking = build(data)",      // 3
      "  return res.json(booking)",         // 4
      "}",                                  // 5
    ];
    expect(enclosingContext(lines, [3, 3])).toEqual([1, 5]);
  });

  it("returns nearby top-level lines when there is no enclosing block", () => {
    const lines = ["const A = 1", "const B = 2"];
    expect(enclosingContext(lines, [2, 2])).toEqual([1, 2]);
  });

  it("always contains the target range", () => {
    const lines = ["a", "b", "c", "d"];
    const [s, e] = enclosingContext(lines, [2, 3]);
    expect(s).toBeLessThanOrEqual(2);
    expect(e).toBeGreaterThanOrEqual(3);
  });

  it("does not crash when the range exceeds the file length", () => {
    const lines = ["class A", "  def m", "    x = 1", "  end", "end"];
    expect(() => enclosingContext(lines, [99, 99])).not.toThrow();
    const [s, e] = enclosingContext(lines, [99, 99]);
    expect(s).toBeGreaterThanOrEqual(1);
    expect(e).toBeLessThanOrEqual(lines.length);
  });
});

describe("enclosingContextCapped", () => {
  it("caps a flat 50k-line file to ±200 lines around the change", () => {
    // Uniform non-zero indent throughout (a "flat/generated" file with no
    // dedented header/footer): enclosingContext balloons to the whole file
    // on both sides, so the cap must kick in on both sides too.
    const lines = Array.from({ length: 50000 }, () => "  x = 1");
    const view = enclosingContextCapped(lines, [25000, 25000]);
    expect(view.range[0]).toBe(24800);
    expect(view.range[1]).toBe(25200);
    expect(view.truncatedAbove).toBe(true);
    expect(view.truncatedBelow).toBe(true);
  });

  it("does not truncate a small enclosing block", () => {
    const lines = ["function a() {", "  x", "}"];
    const view = enclosingContextCapped(lines, [2, 2]);
    expect(view.range).toEqual([1, 3]);
    expect(view.truncatedAbove).toBe(false);
    expect(view.truncatedBelow).toBe(false);
  });
});
