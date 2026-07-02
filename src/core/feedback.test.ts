import { describe, it, expect } from "vitest";
import { buildFeedback, serializeFeedback, parseFeedback, FeedbackValidationError } from "./feedback";
import * as core from "./index";

describe("feedback", () => {
  it("round-trips build -> serialize -> parse", () => {
    const fb = buildFeedback(
      [{ id: "create-booking", verdict: "changes-requested" }],
      [
        {
          flowId: "create-booking",
          path: "app/models/booking.rb",
          lines: [3, 3],
          intent: "must-fix",
          text: "add a DB constraint too",
        },
      ],
      "2026-07-02T12:00:00.000Z",
    );
    const json = serializeFeedback(fb);
    expect(json.endsWith("\n")).toBe(true);
    expect(parseFeedback(json)).toEqual(fb);
  });

  it("rejects an invalid intent", () => {
    const bad = {
      version: 1,
      submittedAt: "2026-07-02T12:00:00.000Z",
      flows: [],
      comments: [{ flowId: "f", path: "a", lines: [1, 1], intent: "blocker", text: "x" }],
    };
    expect(() => parseFeedback(bad)).toThrow(FeedbackValidationError);
  });

  it("rejects an invalid verdict", () => {
    const bad = {
      version: 1,
      submittedAt: "2026-07-02T12:00:00.000Z",
      flows: [{ id: "f", verdict: "lgtm" }],
      comments: [],
    };
    expect(() => parseFeedback(bad)).toThrow(/verdict/);
  });

  it("rejects a non-object top-level input", () => {
    expect(() => parseFeedback(42)).toThrow(FeedbackValidationError);
  });

  it("rejects a wrong version", () => {
    expect(() => parseFeedback({ version: 2, submittedAt: "t", flows: [], comments: [] })).toThrow(/version/);
  });

  it("rejects an empty submittedAt", () => {
    expect(() => parseFeedback({ version: 1, submittedAt: "", flows: [], comments: [] })).toThrow(/submittedAt/);
  });

  it("rejects non-array flows or comments", () => {
    expect(() => parseFeedback({ version: 1, submittedAt: "t", flows: {}, comments: [] })).toThrow(/flows/);
    expect(() => parseFeedback({ version: 1, submittedAt: "t", flows: [], comments: {} })).toThrow(/comments/);
  });

  it("rejects invalid JSON strings", () => {
    expect(() => parseFeedback("{bad")).toThrow(FeedbackValidationError);
  });

  it("rejects an empty comment text", () => {
    const bad = {
      version: 1,
      submittedAt: "t",
      flows: [],
      comments: [{ flowId: "f", path: "a", lines: [1, 1], intent: "nit", text: "" }],
    };
    expect(() => parseFeedback(bad)).toThrow(/text must be a non-empty string/);
  });

  it("rejects invalid comment line ranges", () => {
    const mk = (lines: unknown) => ({
      version: 1,
      submittedAt: "t",
      flows: [],
      comments: [{ flowId: "f", path: "a", lines, intent: "nit", text: "x" }],
    });
    expect(() => parseFeedback(mk([2, 1]))).toThrow(/lines/);   // end < start
    expect(() => parseFeedback(mk([0, 1]))).toThrow(/lines/);   // start < 1
    expect(() => parseFeedback(mk([1]))).toThrow(/lines/);      // wrong length
    expect(() => parseFeedback(mk([1.5, 2]))).toThrow(/lines/); // non-integer
  });

  it("exposes the full public API from the barrel", () => {
    expect(typeof core.parseHandoff).toBe("function");
    expect(typeof core.parseUnifiedDiff).toBe("function");
    expect(typeof core.reconcile).toBe("function");
    expect(typeof core.buildReviewModel).toBe("function");
    expect(typeof core.buildFeedback).toBe("function");
  });
});
