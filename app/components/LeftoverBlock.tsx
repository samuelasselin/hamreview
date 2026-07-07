"use client";

import { useState } from "react";
import type { LeftoverView, ReviewComment } from "../../src/core/index";
import { CommentComposer } from "./CommentComposer";

export function LeftoverBlock({
  leftover,
  comments,
  onAddComment,
}: {
  leftover: LeftoverView;
  comments: ReviewComment[];
  onAddComment: (comment: ReviewComment) => void;
}) {
  const [activeLine, setActiveLine] = useState<number | null>(null);

  return (
    <div className="mb-3 rounded border border-amber-300">
      <div className="bg-amber-50 px-3 py-1 text-sm font-semibold">{leftover.path}</div>
      <div className="text-sm">
        {leftover.truncatedAbove && (
          <div className="bg-gray-50 px-3 py-0.5 text-xs italic text-gray-500">… earlier lines hidden</div>
        )}
        {leftover.lines.map((line) => {
          const lineComments = comments.filter((c) => c.path === leftover.path && c.lines[0] === line.number);
          return (
            <div key={line.number}>
              <div
                onClick={() => setActiveLine(activeLine === line.number ? null : line.number)}
                className={`cursor-pointer px-3 font-mono ${line.kind === "added" ? "bg-green-100" : "opacity-60"} hover:bg-blue-50`}
              >
                <span className="mr-3 select-none text-gray-400">{line.number}</span>
                {line.text || " "}
              </div>
              {lineComments.map((c) => (
                <div key={`${c.lines[0]}-${c.intent}-${c.text}`} className="mx-3 border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs">
                  <b>{c.intent}</b>: {c.text}
                </div>
              ))}
              {activeLine === line.number && (
                <div className="px-3">
                  <CommentComposer
                    path={leftover.path}
                    lines={[line.number, line.number]}
                    flowId="leftovers"
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
        {leftover.truncatedBelow && (
          <div className="bg-gray-50 px-3 py-0.5 text-xs italic text-gray-500">… later lines hidden</div>
        )}
      </div>
    </div>
  );
}
