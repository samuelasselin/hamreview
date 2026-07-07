import {
  buildFeedback,
  type Feedback,
  type FlowVerdict,
  type ReviewComment,
  type ReviewModel,
  type Verdict,
} from "../../src/core/index";

export interface ReviewState {
  verdicts: Record<string, Verdict>;
  comments: ReviewComment[];
  leftoversAcked: boolean;
}

export const emptyReviewState: ReviewState = { verdicts: {}, comments: [], leftoversAcked: false };

export function setLeftoversAcked(state: ReviewState, acked: boolean): ReviewState {
  return { ...state, leftoversAcked: acked };
}

export function setVerdict(state: ReviewState, flowId: string, verdict: Verdict): ReviewState {
  return { ...state, verdicts: { ...state.verdicts, [flowId]: verdict } };
}

export function addComment(state: ReviewState, comment: ReviewComment): ReviewState {
  return { ...state, comments: [...state.comments, comment] };
}

export function removeComment(state: ReviewState, index: number): ReviewState {
  return { ...state, comments: state.comments.filter((_, i) => i !== index) };
}

export function allFlowsDecided(model: ReviewModel, state: ReviewState): boolean {
  return model.flows.every((f) => state.verdicts[f.id] !== undefined);
}

/** Send is allowed once every flow is decided AND leftovers (if any) are acknowledged. */
export function canSend(model: ReviewModel, state: ReviewState): boolean {
  return allFlowsDecided(model, state) && (model.leftovers.length === 0 || state.leftoversAcked);
}

export function toFeedback(state: ReviewState, submittedAt: string): Feedback {
  const flows: FlowVerdict[] = Object.entries(state.verdicts).map(([id, verdict]) => ({ id, verdict }));
  return buildFeedback(flows, state.comments, submittedAt);
}

export function serializeState(state: ReviewState): string {
  return JSON.stringify(state);
}

/** Restore a persisted state; null for anything malformed (fresh start). */
export function deserializeState(raw: string | null): ReviewState | null {
  if (!raw) return null;
  try {
    const d: unknown = JSON.parse(raw);
    if (typeof d !== "object" || d === null || Array.isArray(d)) return null;
    const o = d as Record<string, unknown>;
    if (typeof o.verdicts !== "object" || o.verdicts === null || Array.isArray(o.verdicts)) return null;
    if (!Array.isArray(o.comments)) return null;
    return {
      verdicts: o.verdicts as Record<string, never>,
      comments: o.comments as ReviewState["comments"],
      leftoversAcked: o.leftoversAcked === true,
    } as ReviewState;
  } catch {
    return null;
  }
}
