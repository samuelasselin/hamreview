"use client";

import type { ReviewModel } from "../../src/core/index";
import type { ReviewState } from "../lib/review-state";

export function FlowRail({
  model,
  state,
  current,
  onSelect,
  leftoversSelected,
  onSelectLeftovers,
}: {
  model: ReviewModel;
  state: ReviewState;
  current: number | "leftovers";
  onSelect: (index: number) => void;
  leftoversSelected: boolean;
  onSelectLeftovers: () => void;
}) {
  return (
    <nav className="w-56 shrink-0 border-r border-gray-200 p-3 text-sm">
      {model.flows.map((flow, i) => {
        const verdict = state.verdicts[flow.id];
        const mark = verdict === "approved" ? "✓" : verdict === "changes-requested" ? "✎" : "○";
        const color =
          verdict === "approved" ? "text-green-600" : verdict === "changes-requested" ? "text-amber-600" : "text-gray-400";
        return (
          <button
            key={flow.id}
            type="button"
            onClick={() => onSelect(i)}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left ${
              i === current ? "bg-blue-100 font-semibold" : ""
            }`}
          >
            <span className={color}>{mark}</span>
            <span className="truncate">
              {flow.title}
              {flow.partial && <span className="ml-1 text-xs text-gray-400">(partial)</span>}
            </span>
          </button>
        );
      })}
      {model.leftovers.length > 0 && (
        <button
          type="button"
          onClick={onSelectLeftovers}
          className={`mt-3 flex w-full items-center gap-2 rounded border-t border-gray-200 px-2 pt-2 text-left text-amber-700 ${
            leftoversSelected ? "bg-blue-100 font-semibold" : ""
          }`}
        >
          <span className={state.leftoversAcked ? "text-green-600" : "text-gray-400"}>
            {state.leftoversAcked ? "✓" : "○"}
          </span>
          ⚠ Leftovers ({model.leftovers.length})
        </button>
      )}
    </nav>
  );
}
