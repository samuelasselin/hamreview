"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "flowbite-react";
import type { ReviewComment, ReviewModel, Verdict } from "../src/core/index";
import { FlowRail } from "./components/FlowRail";
import { FlowStep } from "./components/FlowStep";
import { LeftoverBlock } from "./components/LeftoverBlock";
import {
  addComment,
  canSend,
  deserializeState,
  emptyReviewState,
  serializeState,
  setLeftoversAcked,
  setVerdict,
  toFeedback,
  type ReviewState,
} from "./lib/review-state";

const STORAGE_KEY = "hamreview-state";

export default function Home() {
  const [model, setModel] = useState<ReviewModel | null>(null);
  const [state, setState] = useState<ReviewState>(emptyReviewState);
  const [current, setCurrent] = useState<number | "leftovers">(0);
  const [status, setStatus] = useState<"reviewing" | "sent" | "aborted">("reviewing");
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    tokenRef.current = new URLSearchParams(window.location.search).get("token") ?? "";
    fetch("/api/review", { headers: { "x-hamreview-token": tokenRef.current } })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body && typeof body.error === "string" ? body.error : `review request failed (${r.status})`);
        }
        return r.json();
      })
      .then((d) => setModel(d.model))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load the review."));
  }, []);

  // Restore any in-progress state (survives refresh; new runs get a new origin).
  useEffect(() => {
    const restored = deserializeState(sessionStorage.getItem(STORAGE_KEY));
    if (restored) setState(restored);
  }, []);

  // Autosave on every change.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, serializeState(state));
    } catch {
      // storage full/disabled — degrade to in-memory only
    }
  }, [state]);

  // Warn before discarding real work (refresh itself restores via autosave).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasWork = state.comments.length > 0 || Object.keys(state.verdicts).length > 0;
      if (status === "reviewing" && hasWork) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state, status]);

  async function send() {
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "x-hamreview-token": tokenRef.current },
        body: JSON.stringify(toFeedback(state, new Date().toISOString())),
      });
      if (res.ok) setStatus("sent");
      else setError("Failed to send feedback.");
    } catch {
      setError("Failed to send feedback.");
    }
  }

  async function abort() {
    try {
      const res = await fetch("/api/abort", { method: "POST", headers: { "x-hamreview-token": tokenRef.current } });
      if (res.ok) setStatus("aborted");
      else setError("Failed to abort.");
    } catch {
      setError("Failed to abort.");
    }
  }

  if (error) return <main className="p-8 text-red-700">{error}</main>;
  if (!model) return <main className="p-8">Loading review…</main>;
  if (status === "sent") return <main className="p-8">Feedback sent. You can close this tab.</main>;
  if (status === "aborted") return <main className="p-8">Review aborted. You can close this tab.</main>;
  if (model.flows.length === 0) return <main className="p-8">No flows to review.</main>;

  const decided = canSend(model, state);
  const showingLeftovers = current === "leftovers";
  const flow = showingLeftovers ? null : model.flows[current as number];

  return (
    <div className="flex min-h-screen">
      <FlowRail
        model={model}
        state={state}
        current={current}
        onSelect={setCurrent}
        leftoversSelected={showingLeftovers}
        onSelectLeftovers={() => setCurrent("leftovers")}
      />
      <main className="flex-1 p-6">
        {showingLeftovers ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold">⚠ Leftovers</h1>
              <span className="text-sm text-gray-500">changed but not claimed by any flow</span>
            </div>
            {model.leftovers.map((l) => (
              <LeftoverBlock
                key={l.path}
                leftover={l}
                comments={state.comments}
                onAddComment={(c: ReviewComment) => setState((s) => addComment(s, c))}
              />
            ))}
            <div className="mt-6 border-t border-gray-200 pt-4">
              <Button
                color={state.leftoversAcked ? "light" : "green"}
                onClick={() => setState((s) => setLeftoversAcked(s, !s.leftoversAcked))}
              >
                {state.leftoversAcked ? "✓ Leftovers reviewed (click to undo)" : "Mark leftovers as reviewed"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold">
                {flow!.title}
                {flow!.partial && (
                  <span className="ml-2 text-sm font-normal text-gray-500">(partial — more coming)</span>
                )}
              </h1>
              <span className="text-sm text-gray-500">
                Flow {(current as number) + 1} of {model.flows.length}
              </span>
            </div>

            {flow!.steps.map((step, i) => (
              <FlowStep
                key={`${step.path}-${i}`}
                step={step}
                flowId={flow!.id}
                comments={state.comments}
                onAddComment={(c: ReviewComment) => setState((s) => addComment(s, c))}
              />
            ))}

            <div className="mt-6 flex items-center gap-3 border-t border-gray-200 pt-4">
              <Button color="green" onClick={() => setState((s) => setVerdict(s, flow!.id, "approved" as Verdict))}>
                ✓ Approve
              </Button>
              <Button
                color="yellow"
                onClick={() => setState((s) => setVerdict(s, flow!.id, "changes-requested" as Verdict))}
              >
                Request changes
              </Button>
              <div className="flex-1" />
              <Button color="light" disabled={current === 0} onClick={() => setCurrent((c) => (c as number) - 1)}>
                ◀ Prev
              </Button>
              <Button
                color="light"
                disabled={current === model.flows.length - 1}
                onClick={() => setCurrent((c) => (c as number) + 1)}
              >
                Next ▶
              </Button>
            </div>
          </>
        )}

        <div className="mt-6 flex gap-3">
          <Button disabled={!decided} onClick={send}>
            Send to agent
          </Button>
          <Button color="light" onClick={abort}>
            Abort review
          </Button>
        </div>
        {!decided && (
          <p className="mt-2 text-xs text-gray-500">
            Give every flow a verdict{model.leftovers.length > 0 ? " and mark the leftovers as reviewed" : ""} to
            enable Send.
          </p>
        )}
      </main>
    </div>
  );
}
