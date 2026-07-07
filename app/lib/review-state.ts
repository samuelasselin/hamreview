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
