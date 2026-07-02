import type { Handoff, LineRange } from "./types";
import { changedLinesByPath, type Diff } from "./diff";

export interface ReconciledStep {
  path: string;
  role: string;
  note?: string;
  ranges: LineRange[];
  staleRanges: LineRange[];
}

export interface ReconciledFlow {
  id: string;
  title: string;
  complete?: boolean;
  steps: ReconciledStep[];
}

export interface Leftover {
  path: string;
  ranges: LineRange[];
}

export interface ReconcileResult {
  flows: ReconciledFlow[];
  leftovers: Leftover[];
}

function expand(range: LineRange): number[] {
  const [s, e] = range;
  const out: number[] = [];
  for (let i = s; i <= e; i++) out.push(i);
  return out;
}

function toRanges(sorted: number[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else ranges.push([n, n]);
  }
  return ranges;
}

export function reconcile(handoff: Handoff, diff: Diff): ReconcileResult {
  const changed = changedLinesByPath(diff);
  const covered = new Map<string, Set<number>>();

  const flows: ReconciledFlow[] = handoff.flows.map((flow) => {
    const steps: ReconciledStep[] = flow.steps.map((step) => {
      const changedForPath = changed.get(step.path) ?? new Set<number>();
      const staleRanges: LineRange[] = [];
      for (const range of step.ranges) {
        const all = expand(range);
        const changedInRange = all.filter((n) => changedForPath.has(n));
        const staleInRange = all.filter((n) => !changedForPath.has(n));
        if (staleInRange.length > 0) {
          for (const r of toRanges(staleInRange)) staleRanges.push(r);
        }
        if (changedInRange.length > 0) {
          let set = covered.get(step.path);
          if (!set) {
            set = new Set<number>();
            covered.set(step.path, set);
          }
          for (const n of changedInRange) set.add(n);
        }
      }
      return {
        path: step.path,
        role: step.role,
        ...(step.note !== undefined ? { note: step.note } : {}),
        ranges: step.ranges,
        staleRanges,
      };
    });
    return {
      id: flow.id,
      title: flow.title,
      ...(flow.complete !== undefined ? { complete: flow.complete } : {}),
      steps,
    };
  });

  const leftovers: Leftover[] = [];
  for (const [path, changedSet] of changed) {
    const coveredSet = covered.get(path) ?? new Set<number>();
    const uncovered = [...changedSet].filter((n) => !coveredSet.has(n)).sort((a, b) => a - b);
    if (uncovered.length > 0) leftovers.push({ path, ranges: toRanges(uncovered) });
  }
  leftovers.sort((a, b) => a.path.localeCompare(b.path));

  return { flows, leftovers };
}
