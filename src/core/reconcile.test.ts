import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";
import type { Diff } from "./diff";
import type { Handoff } from "./types";

const handoff: Handoff = {
  version: 1,
  root: "/repo",
  base: "working-tree",
  flows: [
    {
      id: "create-booking",
      title: "Create booking",
      steps: [
        { path: "app/models/booking.rb", ranges: [[4, 4]], role: "model" },
        { path: "app/controllers/bookings_controller.rb", ranges: [[9, 10]], role: "endpoint" },
        { path: "app/models/booking.rb", ranges: [[99, 99]], role: "model" }, // stale
      ],
    },
  ],
};

const diff: Diff = {
  files: [
    { path: "app/models/booking.rb", status: "modified", addedLines: [4] },
    { path: "app/controllers/bookings_controller.rb", status: "modified", addedLines: [9, 10] },
    { path: "config/routes.rb", status: "modified", addedLines: [22] }, // unclaimed -> leftover
  ],
};

describe("reconcile", () => {
  it("flags a step whose lines are not in the diff as stale", () => {
    const result = reconcile(handoff, diff);
    expect(result.flows[0].steps[0].staleRanges).toEqual([]);
    expect(result.flows[0].steps[2].staleRanges).toEqual([[99, 99]]);
  });

  it("collects changed-but-unclaimed lines into leftovers, merged into ranges", () => {
    const result = reconcile(handoff, diff);
    expect(result.leftovers).toEqual([{ path: "config/routes.rb", ranges: [[22, 22]] }]);
  });

  it("does not treat claimed lines as leftovers", () => {
    const result = reconcile(handoff, diff);
    const paths = result.leftovers.map((l) => l.path);
    expect(paths).not.toContain("app/models/booking.rb");
    expect(paths).not.toContain("app/controllers/bookings_controller.rb");
  });

  it("splits a partially-changed range: unmatched lines become stale, matched lines covered", () => {
    const h: Handoff = {
      version: 1,
      root: "/r",
      base: "working-tree",
      flows: [{ id: "f", title: "F", steps: [{ path: "a.rb", ranges: [[4, 8]], role: "model" }] }],
    };
    const d: Diff = { files: [{ path: "a.rb", status: "modified", addedLines: [4, 5, 9] }] };
    const result = reconcile(h, d);
    expect(result.flows[0].steps[0].staleRanges).toEqual([[6, 8]]);
    expect(result.leftovers).toEqual([{ path: "a.rb", ranges: [[9, 9]] }]);
  });

  it("passes the complete flag through", () => {
    const h: Handoff = {
      version: 1,
      root: "/r",
      base: "working-tree",
      flows: [{ id: "f", title: "F", complete: true, steps: [{ path: "a.rb", ranges: [[1, 1]], role: "model" }] }],
    };
    const d: Diff = { files: [{ path: "a.rb", status: "modified", addedLines: [1] }] };
    expect(reconcile(h, d).flows[0].complete).toBe(true);
  });
});
