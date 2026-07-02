"use client";

import { useState } from "react";
import type { Intent, LineRange, ReviewComment } from "../../src/core/index";

const INTENTS: { value: Intent; label: string }[] = [
  { value: "must-fix", label: "🔴 Must-fix" },
  { value: "question", label: "❓ Question" },
  { value: "nit", label: "💡 Nit" },
];

export function CommentComposer({
  path,
  lines,
  flowId,
  onSubmit,
  onCancel,
}: {
  path: string;
  lines: LineRange;
  flowId: string;
  onSubmit: (comment: ReviewComment) => void;
  onCancel: () => void;
}) {
  const [intent, setIntent] = useState<Intent>("must-fix");
  const [text, setText] = useState("");

  return (
    <div className="my-1 rounded border border-blue-500 bg-blue-50 p-2">
      <div className="mb-2 flex gap-2">
        {INTENTS.map((it) => (
          <button
            key={it.value}
            type="button"
            onClick={() => setIntent(it.value)}
            className={`rounded-full border px-2 py-0.5 text-xs ${
              intent === it.value ? "border-blue-600 bg-blue-200 font-semibold" : "border-gray-300"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
      <textarea
        className="w-full rounded border border-gray-300 p-1 text-sm"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Comment on this line…"
      />
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={text.trim() === ""}
          onClick={() => onSubmit({ flowId, path, lines, intent, text: text.trim() })}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-40"
        >
          Add
        </button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-0.5 text-xs text-gray-600">
          Cancel
        </button>
      </div>
    </div>
  );
}
