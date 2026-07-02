import { describe, it, expect } from "vitest";
import { buildReviewModel, type FileReader } from "./review-model";
import type { Diff } from "./diff";
import type { Handoff } from "./types";

const files: Record<string, string[]> = {
  "app/models/booking.rb": [
    "class Booking < ApplicationRecord",             // 1
    "  belongs_to :user",                            // 2
    "  validates :end_at, greater_than: :start_at",  // 3
    "end",                                           // 4
  ],
  "app/controllers/bookings_controller.rb": [
    "class BookingsController",   // 1
    "  def create",               // 2
    "    Booking.create!(params)",// 3
    "  end",                      // 4
    "end",                        // 5
  ],
};
const readFile: FileReader = (p) => files[p] ?? [];

const diff: Diff = {
  files: [
    { path: "app/models/booking.rb", status: "modified", addedLines: [3] },
    { path: "app/controllers/bookings_controller.rb", status: "modified", addedLines: [3] },
  ],
};

const handoff: Handoff = {
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
        { path: "app/models/booking.rb", ranges: [[3, 3]], role: "model" },
        { path: "app/controllers/bookings_controller.rb", ranges: [[3, 3]], role: "endpoint" },
      ],
    },
    {
      id: "cancel-booking",
      title: "Cancel booking",
      steps: [{ path: "app/models/booking.rb", ranges: [[3, 3]], role: "model" }],
    },
  ],
};

describe("buildReviewModel", () => {
  it("renders a step with enclosing context and per-line kinds", () => {
    const model = buildReviewModel(handoff, diff, readFile);
    const step = model.flows[0].steps[0];
    expect(step.displayRange).toEqual([1, 4]);
    expect(step.lines.map((l) => l.number)).toEqual([1, 2, 3, 4]);
    expect(step.lines[2]).toEqual({
      number: 3,
      text: "  validates :end_at, greater_than: :start_at",
      kind: "added",
    });
    expect(step.lines[0].kind).toBe("context");
  });

  it("marks a partial flow", () => {
    const model = buildReviewModel(handoff, diff, readFile);
    expect(model.flows[0].partial).toBe(true);
    expect(model.flows[1].partial).toBe(false);
  });

  it("collapses shared code seen in an earlier flow and records where", () => {
    const model = buildReviewModel(handoff, diff, readFile);
    expect(model.flows[0].steps[0].collapsed).toBe(false);
    const shared = model.flows[1].steps[0];
    expect(shared.collapsed).toBe(true);
    expect(shared.alreadyReviewedIn).toBe("create-booking");
  });

  it("carries feature label through", () => {
    expect(buildReviewModel(handoff, diff, readFile).feature).toBe("Bookings");
  });
});
