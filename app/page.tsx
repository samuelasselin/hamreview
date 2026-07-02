"use client";

import { useEffect, useState } from "react";
import { Button } from "flowbite-react";

interface StepView {
  path: string;
  role: string;
  lines: { number: number; text: string; kind: "added" | "context" }[];
}
interface FlowView {
  id: string;
  title: string;
  steps: StepView[];
}
interface ReviewModel {
  feature?: string;
  flows: FlowView[];
  leftovers: { path: string; ranges: [number, number][] }[];
}

export default function Home() {
  const [model, setModel] = useState<ReviewModel | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch("/api/review")
      .then((r) => r.json())
      .then((d) => setModel(d.model));
  }, []);

  async function submit() {
    const feedback = {
      version: 1,
      submittedAt: new Date().toISOString(),
      flows: (model?.flows ?? []).map((f) => ({ id: f.id, verdict: "approved" as const })),
      comments: [],
    };
    await fetch("/api/feedback", { method: "POST", body: JSON.stringify(feedback) });
    setSent(true);
  }

  if (!model) return <main className="p-8">Loading review…</main>;
  if (sent) return <main className="p-8">Feedback sent. You can close this tab.</main>;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-2xl font-bold">{model.feature ?? "Review"}</h1>
      {model.flows.map((flow) => (
        <section key={flow.id} className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">{flow.title}</h2>
          {flow.steps.map((step, i) => (
            <div key={i} className="mb-3 rounded border border-gray-300">
              <div className="bg-gray-100 px-3 py-1 text-sm">
                {step.role} · {step.path}
              </div>
              <pre className="overflow-x-auto p-3 text-sm">
                {step.lines.map((l) => (
                  <div key={l.number} className={l.kind === "added" ? "bg-green-100" : "opacity-60"}>
                    {l.text}
                  </div>
                ))}
              </pre>
            </div>
          ))}
        </section>
      ))}
      {model.leftovers.length > 0 && (
        <p className="mb-4 text-amber-700">⚠ {model.leftovers.length} leftover file(s) not in any flow.</p>
      )}
      <Button onClick={submit}>Approve all &amp; send</Button>
    </main>
  );
}
