/** Inclusive, 1-indexed line range: [start, end]. */
export type LineRange = [start: number, end: number];

// ---- handoff.json (agent -> tool) ----

export interface Handoff {
  version: 1;
  root: string;
  base: string; // "working-tree" or a git ref
  feature?: string;
  flows: HandoffFlow[];
}

export interface HandoffFlow {
  id: string;
  title: string;
  /** When false, the slice is partial ("more coming"); the UI shows a badge. */
  complete?: boolean;
  steps: HandoffStep[];
}

export interface HandoffStep {
  path: string;
  ranges: LineRange[];
  role: string; // free-text, stack-agnostic label (e.g. "migration", "model", "ui")
  note?: string;
}

// ---- feedback.json (tool -> agent) ----

export type Intent = "must-fix" | "question" | "nit";
export type Verdict = "approved" | "changes-requested";

export interface Feedback {
  version: 1;
  submittedAt: string;
  flows: FlowVerdict[];
  comments: ReviewComment[];
}

export interface FlowVerdict {
  id: string;
  verdict: Verdict;
}

export interface ReviewComment {
  flowId: string;
  path: string;
  lines: LineRange;
  intent: Intent;
  text: string;
}
