import { describe, it, expect } from "vitest";
import {
  emptyReviewState,
  setVerdict,
  addComment,
  removeComment,
  allFlowsDecided,
  toFeedback,
  canSend,
  setLeftoversAcked,
} from "./review-state";
import type { ReviewModel } from "../../src/core/index";

const model = {
  flows: [
    { id: "a", title: "A", partial: false, steps: [] },
    { id: "b", title: "B", partial: false, steps: [] },
  ],
  leftovers: [],
} as unknown as ReviewModel;

describe("review-state", () => {
  it("records and overwrites per-flow verdicts immutably", () => {
    const s1 = setVerdict(emptyReviewState, "a", "approved");
    const s2 = setVerdict(s1, "a", "changes-requested");
    expect(emptyReviewState.verdicts).toEqual({});
    expect(s2.verdicts).toEqual({ a: "changes-requested" });
  });

  it("adds and removes comments immutably", () => {
    const c = { flowId: "a", path: "x.ts", lines: [3, 3] as [number, number], intent: "must-fix" as const, text: "fix" };
    const withC = addComment(emptyReviewState, c);
    expect(withC.comments).toEqual([c]);
    expect(removeComment(withC, 0).comments).toEqual([]);
    expect(emptyReviewState.comments).toEqual([]);
  });

  it("allFlowsDecided is true only when every flow has a verdict", () => {
    let s = setVerdict(emptyReviewState, "a", "approved");
    expect(allFlowsDecided(model, s)).toBe(false);
    s = setVerdict(s, "b", "approved");
    expect(allFlowsDecided(model, s)).toBe(true);
  });

  it("assembles a valid Feedback via buildFeedback", () => {
    let s = setVerdict(emptyReviewState, "a", "changes-requested");
    s = addComment(s, { flowId: "a", path: "x.ts", lines: [3, 3], intent: "must-fix", text: "fix" });
    const fb = toFeedback(s, "2026-07-02T00:00:00.000Z");
    expect(fb.version).toBe(1);
    expect(fb.submittedAt).toBe("2026-07-02T00:00:00.000Z");
    expect(fb.flows).toEqual([{ id: "a", verdict: "changes-requested" }]);
    expect(fb.comments[0].intent).toBe("must-fix");
  });
});

describe("leftovers acknowledgment", () => {
  const modelWithLeftovers = {
    flows: [{ id: "f", title: "F", partial: false, steps: [] }],
    leftovers: [{ path: "x.txt", ranges: [[1, 1]], lines: [], truncatedAbove: false, truncatedBelow: false }],
  } as unknown as ReviewModel;
  const modelWithout = { flows: [{ id: "f", title: "F", partial: false, steps: [] }], leftovers: [] } as unknown as ReviewModel;

  it("blocks Send until leftovers are acknowledged", () => {
    const decided = setVerdict(emptyReviewState, "f", "approved");
    expect(canSend(modelWithLeftovers, decided)).toBe(false);
    expect(canSend(modelWithLeftovers, setLeftoversAcked(decided, true))).toBe(true);
  });

  it("does not require acknowledgment when there are no leftovers", () => {
    const decided = setVerdict(emptyReviewState, "f", "approved");
    expect(canSend(modelWithout, decided)).toBe(true);
  });

  it("still requires every flow verdict", () => {
    expect(canSend(modelWithout, emptyReviewState)).toBe(false);
  });
});
