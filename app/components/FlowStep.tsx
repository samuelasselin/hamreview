"use client";

import { useState } from "react";
import type { ReviewComment, StepView } from "../../src/core/index";
import { CommentComposer } from "./CommentComposer";

export function FlowStep({
  step,
  flowId,
  comments,
  onAddComment,
}: {
  step: StepView;
  flowId: string;
  comments: ReviewComment[];
  onAddComment: (comment: ReviewComment) => void;
}) {
  const [activeLine, setActiveLine] = useState<number | null>(null);

  return (
    <div className="mb-3 rounded border border-gray-300">
      <div className="flex items-center justify-between bg-gray-100 px-3 py-1 text-sm">
        <span>
          <span className="font-semibold">{step.role}</span> · {step.path}
        </span>
        <span className="flex gap-2">
          {step.stale && <span className="rounded bg-amber-200 px-1 text-xs text-amber-800">stale</span>}
          {step.collapsed && step.alreadyReviewedIn && (
            <span className="rounded bg-gray-200 px-1 text-xs text-gray-600">
              already reviewed in {step.alreadyReviewedIn}
            </span>
          )}
        </span>
      </div>
      {!step.collapsed && (
        <div className="text-sm">
          {step.lines.map((line) => {
            const lineComments = comments.filter((c) => c.path === step.path && c.lines[0] === line.number);
            return (
              <div key={line.number}>
                <div
                  onClick={() => setActiveLine(activeLine === line.number ? null : line.number)}
                  className={`cursor-pointer px-3 font-mono ${
                    line.kind === "added" ? "bg-green-100" : "opacity-60"
                  } hover:bg-blue-50`}
                >
                  <span className="mr-3 select-none text-gray-400">{line.number}</span>
                  {line.text || " "}
                </div>
                {lineComments.map((c, i) => (
                  <div key={i} className="mx-3 border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs">
                    <b>{c.intent}</b>: {c.text}
                  </div>
                ))}
                {activeLine === line.number && (
                  <div className="px-3">
                    <CommentComposer
                      path={step.path}
                      lines={[line.number, line.number]}
                      flowId={flowId}
                      onSubmit={(c) => {
                        onAddComment(c);
                        setActiveLine(null);
                      }}
                      onCancel={() => setActiveLine(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
