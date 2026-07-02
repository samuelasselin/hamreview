import type { Handoff, LineRange } from "./types";
import { changedLinesByPath, type Diff } from "./diff";
import { reconcile, type Leftover } from "./reconcile";
import { enclosingContext } from "./context";

export type LineKind = "added" | "context";

export interface DisplayLine {
  number: number;
  text: string;
  kind: LineKind;
}

export interface StepView {
  path: string;
  role: string;
  note?: string;
  displayRange: LineRange;
  lines: DisplayLine[];
  stale: boolean;
  staleRanges: LineRange[];
  collapsed: boolean;
  alreadyReviewedIn?: string;
}

export interface FlowView {
  id: string;
  title: string;
  partial: boolean;
  steps: StepView[];
}

export interface LeftoverView {
  path: string;
  ranges: LineRange[];
}

export interface ReviewModel {
  feature?: string;
  flows: FlowView[];
  leftovers: LeftoverView[];
}

export type FileReader = (path: string) => string[];

function hull(ranges: LineRange[]): LineRange {
  if (ranges.length === 0) return [1, 1]; // defensive; the schema forbids empty ranges
  let s = Infinity;
  let e = -Infinity;
  for (const [a, b] of ranges) {
    if (a < s) s = a;
    if (b > e) e = b;
  }
  return [s, e];
}

function overlaps(a: LineRange, b: LineRange): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function buildReviewModel(handoff: Handoff, diff: Diff, readFile: FileReader): ReviewModel {
  const result = reconcile(handoff, diff);
  const changed = changedLinesByPath(diff);
  const seen = new Map<string, { flowId: string; range: LineRange }[]>();

  const flows: FlowView[] = result.flows.map((flow) => {
    const steps: StepView[] = flow.steps.map((step) => {
      const lines = readFile(step.path);
      const span = hull(step.ranges);
      const display = enclosingContext(lines, span);
      const changedForPath = changed.get(step.path) ?? new Set<number>();

      const displayLines: DisplayLine[] = [];
      for (let n = display[0]; n <= display[1]; n++) {
        displayLines.push({
          number: n,
          text: lines[n - 1] ?? "",
          kind: changedForPath.has(n) ? "added" : "context",
        });
      }

      const prior = (seen.get(step.path) ?? []).find((p) => overlaps(p.range, span));
      const view: StepView = {
        path: step.path,
        role: step.role,
        ...(step.note !== undefined ? { note: step.note } : {}),
        displayRange: display,
        lines: displayLines,
        stale: step.staleRanges.length > 0,
        staleRanges: step.staleRanges,
        collapsed: prior !== undefined,
        ...(prior ? { alreadyReviewedIn: prior.flowId } : {}),
      };

      const entries = seen.get(step.path) ?? [];
      entries.push({ flowId: flow.id, range: span });
      seen.set(step.path, entries);

      return view;
    });

    return {
      id: flow.id,
      title: flow.title,
      partial: flow.complete === false,
      steps,
    };
  });

  const leftovers: LeftoverView[] = result.leftovers.map((l: Leftover) => ({
    path: l.path,
    ranges: l.ranges,
  }));

  return {
    ...(handoff.feature !== undefined ? { feature: handoff.feature } : {}),
    flows,
    leftovers,
  };
}
