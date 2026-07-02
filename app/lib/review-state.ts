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
}

export const emptyReviewState: ReviewState = { verdicts: {}, comments: [] };

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

export function toFeedback(state: ReviewState, submittedAt: string): Feedback {
  const flows: FlowVerdict[] = Object.entries(state.verdicts).map(([id, verdict]) => ({ id, verdict }));
  return buildFeedback(flows, state.comments, submittedAt);
}
